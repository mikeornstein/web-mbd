! or_mesh_force.F90 — multi-element OR force path (MVSIZ packets).
! Packs hexes into S8EFORC3 calls of NEL≤128 (live FORINT group width).
! NEL≤128: one packet (exact). NEL>128: consecutive packets; SCUMU3
! accumulates into shared anod (not zeroed between packets).
! Keeps one-hex ABI in or_hex_force.F90 unchanged (separate ELBUF).
!
! BIND(C): wmbd_mesh_internal_forces_or
!   conn: int32[8*n_hex], 0-based node indices (web-mbd order)
!   stress/eqps/vol0/smstr/offg/hist: per-element flat arrays
!   f_out: 3*n_nodes — nodal forces from SCUMU3 into A (same as live IPARIT=0)
!
! Return: 0 ok, -2 packed only, -4 alloc fail, -5 nel/numnod unsupported

module wmbd_or_mesh_force_mod
  use, intrinsic :: iso_c_binding
  use elbufdef_mod
  use mat_elem_mod
  use matparam_def_mod
  use timer_mod
  use output_mod
  use ale_connectivity_mod
  use nlocal_reg_mod
  use sensor_mod
  use dt_mod
  use glob_therm_mod
  use table_mod
  use constant_mod, only: zero, one, two, three, five, six, four_over_3
  use element_mod, only: nixs
  implicit none

  type, bind(C) :: wmbd_mat_mesh_c
     real(c_double) :: density
     real(c_double) :: young
     real(c_double) :: poisson
     real(c_double) :: yield_stress
     real(c_double) :: hardening
  end type wmbd_mat_mesh_c

  integer, parameter :: ngroup_c = 1
  integer, parameter :: nummat_c = 1
  integer, parameter :: numgeo_c = 1
  integer, parameter :: mvsiz_c = 129
  integer, parameter :: max_nel_c = 128
  ! Soft cap on total hexes (production Taylor 6×6×16 = 576).
  integer, parameter :: max_hex_c = 4096

  logical, save :: mesh_ready = .false.
  integer, save :: mesh_nel = 0
  integer, save :: mesh_numnod = 0
  integer, save :: mesh_buf_nel = 0

  type(elbuf_struct_), target, save :: elbuf_tab(ngroup_c)
  type(matparam_struct_), target, save :: mat_param_arr(nummat_c)
  type(mat_elem_), save :: mat_elem

  integer, save :: nparg_s, npropm_s, npropg_s, npropgi_s, npropmi_s
  integer, allocatable, save :: iparg(:,:)
  integer, allocatable, save :: ixs(:,:)
  integer, allocatable, save :: ipm(:,:)
  integer, allocatable, save :: igeo(:,:)
  integer, allocatable, save :: iparts(:)
  real(kind=8), allocatable, save :: pm(:,:)
  real(kind=8), allocatable, save :: geo(:,:)
  real(kind=8), allocatable, save :: xnod(:,:)
  real(kind=8), allocatable, save :: vnod(:,:)
  real(kind=8), allocatable, save :: anod(:,:)
  real(kind=8), allocatable, save :: dnod(:,:)
  real(kind=8), allocatable, save :: wnod(:,:)
  real(kind=8), allocatable, save :: ms(:)
  real(kind=8), allocatable, save :: stifn(:)
  double precision, allocatable, save :: xdp(:,:)

  type(timer_), save :: timers
  type(output_), save :: output
  type(t_ale_connectivity), save :: ale_connect
  type(nlocal_str_), save :: nloc_dmg
  type(sensors_), save :: sensors
  type(dt_), save :: dt_t
  type(glob_therm_), save :: glob_therm
  type(ttable), save :: table(1)
  real(kind=8), save :: f11(mvsiz_c), f21(mvsiz_c), f31(mvsiz_c)
  real(kind=8), save :: f12(mvsiz_c), f22(mvsiz_c), f32(mvsiz_c)
  real(kind=8), save :: f13(mvsiz_c), f23(mvsiz_c), f33(mvsiz_c)
  real(kind=8), save :: f14(mvsiz_c), f24(mvsiz_c), f34(mvsiz_c)
  real(kind=8), save :: f15(mvsiz_c), f25(mvsiz_c), f35(mvsiz_c)
  real(kind=8), save :: f16(mvsiz_c), f26(mvsiz_c), f36(mvsiz_c)
  real(kind=8), save :: f17(mvsiz_c), f27(mvsiz_c), f37(mvsiz_c)
  real(kind=8), save :: f18(mvsiz_c), f28(mvsiz_c), f38(mvsiz_c)
  real(kind=8), save :: voln(mvsiz_c), svis(mvsiz_c, 6)
  real(kind=8), save :: veul(1), fv(1), tf(1), bufmat(1), partsav(1)
  real(kind=8), save :: fsky(1), eani(1), temp(1), fthe(1), fthesky(1)
  real(kind=8), save :: gresav(1), mssa(1), dmels(1), condn(1), condnsky(1)
  real(kind=8), save :: flu1(1)
  integer, save :: npf(1), iads(8, 1), grth(1), igrth(1)

  interface
    subroutine wmbd_or_init_commons()
    end subroutine wmbd_or_init_commons
    subroutine wmbd_or_set_group(nnod, nels)
      integer, intent(in) :: nnod, nels
    end subroutine wmbd_or_set_group
    subroutine wmbd_allocbuf_auto(elbuf_tab, nlay, nptr, npts, nptt, nintlay, nel, npt, ng, &
         ngroup, ity, igtyp, nummat, mat_param)
      use elbufdef_mod
      use matparam_def_mod
      integer, intent(in) :: nlay, nptr, npts, nptt, nintlay, nel, npt, ng, ngroup, ity, igtyp, nummat
      type(elbuf_struct_), target, dimension(ngroup) :: elbuf_tab
      type(matparam_struct_), dimension(nummat), intent(in) :: mat_param
    end subroutine wmbd_allocbuf_auto
  end interface

contains

  subroutine ensure_sizes()
    nparg_s = 100
    npropm_s = 250
    npropg_s = 1000
    npropgi_s = 850
    npropmi_s = 400
  end subroutine ensure_sizes

  function alloc_mesh_elbuf(mat, nel_in, numnod_in) result(ok)
    type(wmbd_mat_mesh_c), intent(in) :: mat
    integer, intent(in) :: nel_in, numnod_in
    logical :: ok
    integer :: ir, is, it, ie, ng, nlay, nptr, npts, nptt, nintlay, nel, npt, ity, igtyp
    integer :: istat
    real(kind=8) :: g, bulk, young, anu, rho0
    type(buf_lay_), pointer :: bufly

    ok = .false.
    call ensure_sizes()

    young = mat%young
    anu = mat%poisson
    rho0 = mat%density
    g = young / (two * (one + anu))
    bulk = young / (three * (one - two * anu))

    call mat_param_arr(1)%zeroing()
    mat_param_arr(1)%ilaw = 2
    mat_param_arr(1)%mat_id = 1
    mat_param_arr(1)%rho = rho0
    mat_param_arr(1)%rho0 = rho0
    mat_param_arr(1)%young = young
    mat_param_arr(1)%young0 = young
    mat_param_arr(1)%nu = anu
    mat_param_arr(1)%bulk = bulk
    mat_param_arr(1)%shear = g
    mat_param_arr(1)%niparam = 4
    mat_param_arr(1)%nuparam = 12
    mat_param_arr(1)%nfail = 0
    allocate(mat_param_arr(1)%iparam(4), mat_param_arr(1)%uparam(12), stat=istat)
    if (istat /= 0) return
    ! Match starter hm_read_mat02_jc for /MAT/PLAS_JOHNS with CC=0:
    ! IFORM=0 (JC), ICC=1, VP=2 (total strain rate), ISRATE=0.
    mat_param_arr(1)%iparam = 0
    mat_param_arr(1)%iparam(1) = 0
    mat_param_arr(1)%iparam(2) = 1
    mat_param_arr(1)%iparam(3) = 2
    mat_param_arr(1)%iparam(4) = 0
    mat_param_arr(1)%uparam = zero
    mat_param_arr(1)%uparam(1) = mat%yield_stress
    mat_param_arr(1)%uparam(2) = mat%hardening
    mat_param_arr(1)%uparam(3) = one
    mat_param_arr(1)%uparam(4) = 1.0d30
    mat_param_arr(1)%uparam(5) = 1.0d30
    mat_param_arr(1)%uparam(6) = zero
    mat_param_arr(1)%uparam(7) = one
    mat_param_arr(1)%uparam(8) = zero
    mat_param_arr(1)%uparam(9) = zero
    mat_param_arr(1)%uparam(10) = one
    mat_param_arr(1)%uparam(11) = 1.0d30
    mat_param_arr(1)%uparam(12) = -1.0d30
    mat_param_arr(1)%therm%tref = 300.0d0
    mat_param_arr(1)%therm%tini = 300.0d0
    mat_param_arr(1)%therm%tmelt = 1.0d30
    mat_param_arr(1)%therm%rhocp = zero

    mat_elem%ngroup = 1
    mat_elem%nummat = 1
    mat_elem%numgeo = 1
    mat_elem%mat_param => mat_param_arr

    ng = 1
    nlay = 1
    nptr = 2
    npts = 2
    nptt = 2
    nintlay = 0
    nel = nel_in
    npt = 8
    ity = 1
    igtyp = 14

    elbuf_tab(ng)%igtyp = igtyp
    elbuf_tab(ng)%nel = nel
    elbuf_tab(ng)%nlay = nlay
    elbuf_tab(ng)%nintlay = nintlay
    elbuf_tab(ng)%nptr = nptr
    elbuf_tab(ng)%npts = npts
    elbuf_tab(ng)%nptt = nptt
    elbuf_tab(ng)%ixfem = 0
    elbuf_tab(ng)%nxel = 0
    elbuf_tab(ng)%idrape = 0

    allocate(elbuf_tab(ng)%bufly(nlay), stat=istat)
    if (istat /= 0) return
    allocate(elbuf_tab(ng)%intlay(0), stat=istat)
    allocate(elbuf_tab(ng)%nlocts(0, 0), stat=istat)

    bufly => elbuf_tab(ng)%bufly(1)
    bufly%ilaw = 2
    bufly%imat = 1
    bufly%ieos = 0
    bufly%ivisc = 0
    bufly%iporo = 0
    bufly%nfail = 0
    bufly%nvar_mat = 0
    bufly%nvar_eos = 0
    bufly%nvartmp = 0
    bufly%nvartmp_eos = 0
    bufly%nvar_visc = 0
    bufly%nptt = nptt
    bufly%ly_dmg = 0
    bufly%ly_gama = 0
    bufly%ly_dira = 0
    bufly%ly_dirb = 0
    bufly%ly_crkdir = 0
    bufly%ly_plapt = 0
    bufly%ly_sigpt = 0
    bufly%ly_hourg = 0
    bufly%ly_uelr = 0
    bufly%ly_uelr1 = 0
    bufly%ly_offpg = 0
    bufly%ly_off = 0

    bufly%l_off = 1
    bufly%l_gama = 0
    bufly%l_stra = 6
    bufly%l_frac = 0
    bufly%l_bfrac = 0
    bufly%l_eint = 1
    bufly%l_eins = 0
    bufly%l_rho = 1
    bufly%l_dp_drho = 0
    bufly%l_qvis = 1
    bufly%l_deltax = 0
    bufly%l_vol = 1
    bufly%l_epsa = 0
    bufly%l_epsd = 1
    bufly%l_epsq = 1
    bufly%l_epsf = 0
    bufly%l_pla = 1
    bufly%l_wpla = 0
    bufly%l_temp = 1
    bufly%l_tb = 0
    bufly%l_rk = 0
    bufly%l_re = 0
    bufly%l_vk = 0
    bufly%l_sf = 0
    bufly%l_rob = 0
    bufly%l_dam = 0
    bufly%l_dsum = 0
    bufly%l_dglo = 0
    bufly%l_crak = 0
    bufly%l_ang = 0
    bufly%l_epe = 0
    bufly%l_epc = 0
    bufly%l_xst = 0
    bufly%l_ssp = 0
    bufly%l_z = 0
    bufly%l_visc = 0
    bufly%l_sigl = 0
    bufly%l_sigv = 0
    bufly%l_siga = 0
    bufly%l_sigb = 6
    bufly%l_sigc = 0
    bufly%l_sigd = 0
    bufly%l_sigf = 0
    bufly%l_sig = 6
    bufly%l_sigply = 0
    bufly%l_for = 0
    bufly%l_mom = 0
    bufly%l_thk = 0
    bufly%l_smstr = 0
    bufly%l_dmg = 1
    bufly%l_forth = 0
    bufly%l_eintth = 0
    bufly%l_seq = 0
    bufly%l_jac_i = 0
    bufly%l_fac_yld = 0
    bufly%l_aburn = 0
    bufly%l_mu = 0
    bufly%l_pij = 0
    bufly%l_vol0dp = 1
    bufly%l_planl = 0
    bufly%l_epsdnl = 0
    bufly%l_dmgscl = 0
    bufly%l_tsaiwu = 0

    allocate(bufly%lbuf(nptr, npts, nptt), stat=istat)
    if (istat /= 0) return
    allocate(bufly%mat(nptr, npts, nptt), stat=istat)
    allocate(bufly%fail(nptr, npts, nptt), stat=istat)
    allocate(bufly%prop(nptr, npts, nptt), stat=istat)
    allocate(bufly%eos(nptr, npts, nptt), stat=istat)
    allocate(bufly%visc(nptr, npts, nptt), stat=istat)
    allocate(bufly%poro(nptr, npts, nptt), stat=istat)
    allocate(bufly%q1np(0, 0, 0), stat=istat)

    elbuf_tab(ng)%gbuf%g_noff = 0
    elbuf_tab(ng)%gbuf%g_ierr = 0
    elbuf_tab(ng)%gbuf%g_off = 1
    elbuf_tab(ng)%gbuf%g_gama = 6
    elbuf_tab(ng)%gbuf%g_smstr = 21
    elbuf_tab(ng)%gbuf%g_hourg = 0
    elbuf_tab(ng)%gbuf%g_bfrac = 0
    elbuf_tab(ng)%gbuf%g_eint = 1
    elbuf_tab(ng)%gbuf%g_eins = 0
    elbuf_tab(ng)%gbuf%g_rho = 1
    elbuf_tab(ng)%gbuf%g_qvis = 1
    elbuf_tab(ng)%gbuf%g_deltax = 0
    elbuf_tab(ng)%gbuf%g_vol = 1
    elbuf_tab(ng)%gbuf%g_epsd = 1
    elbuf_tab(ng)%gbuf%g_epsq = 0
    elbuf_tab(ng)%gbuf%g_pla = 1
    elbuf_tab(ng)%gbuf%g_wpla = 0
    elbuf_tab(ng)%gbuf%g_temp = 1
    elbuf_tab(ng)%gbuf%g_tb = 0
    elbuf_tab(ng)%gbuf%g_rk = 0
    elbuf_tab(ng)%gbuf%g_re = 0
    elbuf_tab(ng)%gbuf%g_sig = 6
    elbuf_tab(ng)%gbuf%g_for = 0
    elbuf_tab(ng)%gbuf%g_mom = 0
    elbuf_tab(ng)%gbuf%g_thk = 0
    elbuf_tab(ng)%gbuf%g_tag22 = 0
    elbuf_tab(ng)%gbuf%g_stra = 0
    elbuf_tab(ng)%gbuf%g_sigi = 0
    elbuf_tab(ng)%gbuf%g_dmg = 1
    elbuf_tab(ng)%gbuf%g_forpg = 0
    elbuf_tab(ng)%gbuf%g_mompg = 0
    elbuf_tab(ng)%gbuf%g_gama_r = 6
    elbuf_tab(ng)%gbuf%g_for_g = 0
    elbuf_tab(ng)%gbuf%g_forpg_g = 0
    elbuf_tab(ng)%gbuf%g_strpg = 0
    elbuf_tab(ng)%gbuf%g_uelr = 0
    elbuf_tab(ng)%gbuf%g_uelr1 = 0
    elbuf_tab(ng)%gbuf%g_damdl = 0
    elbuf_tab(ng)%gbuf%g_forth = 0
    elbuf_tab(ng)%gbuf%g_eintth = 0
    elbuf_tab(ng)%gbuf%g_fill = 1
    elbuf_tab(ng)%gbuf%g_seq = 0
    elbuf_tab(ng)%gbuf%g_strw = 0
    elbuf_tab(ng)%gbuf%g_strwpg = 0
    elbuf_tab(ng)%gbuf%g_thk_i = 0
    elbuf_tab(ng)%gbuf%g_jac_i = 0
    elbuf_tab(ng)%gbuf%g_dt = 1
    elbuf_tab(ng)%gbuf%g_isms = 0
    elbuf_tab(ng)%gbuf%g_strhg = 0
    elbuf_tab(ng)%gbuf%g_bpreld = 0
    elbuf_tab(ng)%gbuf%g_aburn = 0
    elbuf_tab(ng)%gbuf%g_mu = 0
    elbuf_tab(ng)%gbuf%g_planl = 0
    elbuf_tab(ng)%gbuf%g_epsdnl = 0
    elbuf_tab(ng)%gbuf%g_tempg = 0
    elbuf_tab(ng)%gbuf%g_cor_nf = 0
    elbuf_tab(ng)%gbuf%g_cor_fr = 0
    elbuf_tab(ng)%gbuf%g_cor_xr = 0
    elbuf_tab(ng)%gbuf%g_maxfrac = 0
    elbuf_tab(ng)%gbuf%g_maxeps = 0
    elbuf_tab(ng)%gbuf%g_betaorth = 0
    elbuf_tab(ng)%gbuf%g_amu = 0
    elbuf_tab(ng)%gbuf%g_tsaiwu = 0
    elbuf_tab(ng)%gbuf%g_dmgscl = 0
    elbuf_tab(ng)%gbuf%g_sh_ioffset = 0
    elbuf_tab(ng)%gbuf%g_eint_distor = 0
    elbuf_tab(ng)%gbuf%g_nuvar = 0
    elbuf_tab(ng)%gbuf%g_nuvarn = 0
    elbuf_tab(ng)%gbuf%g_intvar = 0

    call wmbd_allocbuf_auto(elbuf_tab, nlay, nptr, npts, nptt, nintlay, nel, npt, ng, &
         ngroup_c, ity, igtyp, nummat_c, mat_param_arr)

    do ie = 1, nel
      elbuf_tab(ng)%gbuf%off(ie) = one
      elbuf_tab(ng)%gbuf%rho(ie) = rho0
      elbuf_tab(ng)%gbuf%fill(ie) = one
      elbuf_tab(ng)%gbuf%vol(ie) = zero
    end do
    do ir = 1, nptr
      do is = 1, npts
        do it = 1, nptt
          do ie = 1, nel
            elbuf_tab(ng)%bufly(1)%lbuf(ir, is, it)%off(ie) = one
            elbuf_tab(ng)%bufly(1)%lbuf(ir, is, it)%rho(ie) = rho0
          end do
        end do
      end do
    end do

    allocate(iparg(nparg_s, ngroup_c), source=0)
    allocate(ixs(nixs, nel), source=0)
    allocate(ipm(npropmi_s, nummat_c), source=0)
    allocate(igeo(npropgi_s, numgeo_c), source=0)
    allocate(pm(npropm_s, nummat_c), source=0.0_8)
    allocate(geo(npropg_s, numgeo_c), source=0.0_8)
    allocate(xnod(3, numnod_in), source=0.0_8)
    allocate(vnod(3, numnod_in), source=0.0_8)
    allocate(anod(3, numnod_in), source=0.0_8)
    allocate(dnod(3, numnod_in), source=0.0_8)
    allocate(wnod(3, numnod_in), source=0.0_8)
    allocate(ms(numnod_in), source=0.0_8)
    allocate(stifn(numnod_in), source=0.0_8)

    iparg(1, 1) = 2
    iparg(2, 1) = nel
    iparg(3, 1) = 0
    iparg(5, 1) = 1
    iparg(6, 1) = 8
    iparg(9, 1) = 4
    iparg(10, 1) = 1
    iparg(14, 1) = 1
    iparg(18, 1) = 1
    iparg(23, 1) = 17
    iparg(28, 1) = 8
    iparg(29, 1) = 1
    iparg(36, 1) = 1
    iparg(37, 1) = 0
    iparg(38, 1) = 14
    iparg(56, 1) = 2
    iparg(57, 1) = 2
    iparg(58, 1) = 2
    iparg(59, 1) = 1
    iparg(72, 1) = 0
    iparg(78, 1) = 0

    allocate(iparts(nel), source=1)
    allocate(xdp(3, numnod_in), source=0.0d0)
    do ie = 1, nel
      ixs(1, ie) = 1
      ! node connectivity filled in pack_mesh
      ixs(10, ie) = 1
      ixs(11, ie) = ie
    end do
    pm(20, 1) = young
    pm(21, 1) = anu
    pm(22, 1) = g
    pm(24, 1) = young / (one - anu * anu)
    pm(25, 1) = anu * pm(24, 1)
    pm(26, 1) = five / six
    pm(27, 1) = sqrt(young / max(rho0, 1.0d-20))
    pm(28, 1) = one / young
    pm(29, 1) = -anu * pm(28, 1)
    pm(30, 1) = one / g
    pm(32, 1) = bulk
    pm(37, 1) = -1.0d30
    pm(38, 1) = mat%yield_stress
    pm(39, 1) = mat%hardening
    pm(40, 1) = one
    pm(41, 1) = 1.0d30
    pm(42, 1) = 1.0d30
    pm(43, 1) = zero
    pm(44, 1) = one
    pm(47, 1) = 1.0d30
    pm(49, 1) = one
    pm(50, 1) = zero
    pm(51, 1) = one
    pm(55, 1) = zero
    pm(79, 1) = 300.0d0
    pm(80, 1) = 1.0d30
    pm(105, 1) = two * g / (bulk + four_over_3 * g)
    pm(89, 1) = rho0
    pm(1, 1) = rho0
    ipm(1, 1) = 1
    ipm(2, 1) = 2
    ipm(255, 1) = 2

    igeo(1, 1) = 1
    igeo(4, 1) = 8
    igeo(5, 1) = 4
    igeo(10, 1) = 17
    igeo(11, 1) = 14
    igeo(13, 1) = 1
    igeo(15, 1) = 1
    igeo(16, 1) = 0
    igeo(97, 1) = 0
    geo(14, 1) = 1.0d-20
    geo(15, 1) = 1.0d-21

    ok = .true.
    mesh_nel = nel
    mesh_buf_nel = nel
    mesh_numnod = numnod_in
  end function alloc_mesh_elbuf


  subroutine pack_mesh(n_hex, n_nodes, x, v, conn, stress_io, eqps_io, vol0_io, smstr_io, offg_io, hist_io)
    integer(c_int), intent(in), value :: n_hex, n_nodes
    real(c_double), intent(in) :: x(3 * n_nodes), v(3 * n_nodes)
    integer(c_int), intent(in) :: conn(8 * n_hex)
    real(c_double), intent(in) :: stress_io(48 * n_hex), eqps_io(8 * n_hex), vol0_io(8 * n_hex)
    real(c_double), intent(in) :: smstr_io(21 * n_hex), offg_io(n_hex), hist_io(32 * n_hex)
    integer :: n, ie, a, ir, is, it, ip, k, base, nel
    type(l_bufel_), pointer :: lbuf
    real(kind=8) :: eint_sum, rho_sum

    nel = n_hex
    do n = 1, n_nodes
      xnod(1, n) = x(3 * (n - 1) + 1)
      xnod(2, n) = x(3 * (n - 1) + 2)
      xnod(3, n) = x(3 * (n - 1) + 3)
      vnod(1, n) = v(3 * (n - 1) + 1)
      vnod(2, n) = v(3 * (n - 1) + 2)
      vnod(3, n) = v(3 * (n - 1) + 3)
    end do
    anod = zero
    dnod = zero
    wnod = zero

    do ie = 1, nel
      do a = 1, 8
        ! conn is 0-based node index from TS
        ixs(1 + a, ie) = conn(8 * (ie - 1) + a) + 1
      end do
      elbuf_tab(1)%gbuf%off(ie) = offg_io(ie)
      do k = 1, 21
        elbuf_tab(1)%gbuf%smstr(ie + (k - 1) * nel) = smstr_io(21 * (ie - 1) + k)
      end do
      if (associated(elbuf_tab(1)%gbuf%pla)) elbuf_tab(1)%gbuf%pla(ie) = zero
      if (associated(elbuf_tab(1)%gbuf%sig)) then
        do k = 1, 6
          elbuf_tab(1)%gbuf%sig(ie + (k - 1) * nel) = zero
        end do
      end if
    end do

    do ie = 1, nel
      eint_sum = zero
      rho_sum = zero
      base = 48 * (ie - 1)
      do it = 1, 2
        do is = 1, 2
          do ir = 1, 2
            ip = ir + ((is - 1) + (it - 1) * 2) * 2
            lbuf => elbuf_tab(1)%bufly(1)%lbuf(ir, is, it)
            do k = 1, 6
              lbuf%sig(ie + (k - 1) * nel) = stress_io(base + 6 * (ip - 1) + k)
            end do
            lbuf%pla(ie) = eqps_io(8 * (ie - 1) + ip)
            lbuf%vol(ie) = vol0_io(8 * (ie - 1) + ip)
            lbuf%vol0dp(ie) = vol0_io(8 * (ie - 1) + ip)
            lbuf%eint(ie) = hist_io(32 * (ie - 1) + ip)
            lbuf%epsd(ie) = hist_io(32 * (ie - 1) + 8 + ip)
            lbuf%qvis(ie) = hist_io(32 * (ie - 1) + 16 + ip)
            lbuf%rho(ie) = hist_io(32 * (ie - 1) + 24 + ip)
            lbuf%off(ie) = one
            eint_sum = eint_sum + lbuf%eint(ie)
            rho_sum = rho_sum + lbuf%rho(ie)
            if (associated(lbuf%sigb)) then
              do k = 1, 6
                lbuf%sigb(ie + (k - 1) * nel) = zero
              end do
            end if
            if (associated(lbuf%stra)) then
              do k = 1, 6
                lbuf%stra(ie + (k - 1) * nel) = zero
              end do
            end if
          end do
        end do
      end do
      elbuf_tab(1)%gbuf%eint(ie) = eint_sum * 0.125d0
      elbuf_tab(1)%gbuf%rho(ie) = rho_sum * 0.125d0
      elbuf_tab(1)%gbuf%qvis(ie) = zero
      elbuf_tab(1)%gbuf%epsd(ie) = zero
    end do
  end subroutine pack_mesh

  ! Pack one MVSIZ packet starting at global element ie0 (0-based) into
  ! ELBUF slots 1..pnel with stride=pnel (must match S8EFORC3 NEL). Buffer may
  ! be allocated larger (max_nel_c); unused tail is ignored.
  subroutine pack_packet(ie0, pnel, n_hex, n_nodes, x, v, conn, &
       stress_io, eqps_io, vol0_io, smstr_io, offg_io, hist_io, zero_anod)
    integer, intent(in) :: ie0, pnel, n_hex, n_nodes
    real(c_double), intent(in) :: x(3 * n_nodes), v(3 * n_nodes)
    integer(c_int), intent(in) :: conn(8 * n_hex)
    real(c_double), intent(in) :: stress_io(48 * n_hex), eqps_io(8 * n_hex), vol0_io(8 * n_hex)
    real(c_double), intent(in) :: smstr_io(21 * n_hex), offg_io(n_hex), hist_io(32 * n_hex)
    logical, intent(in) :: zero_anod
    integer :: n, ie, ig, a, ir, is, it, ip, k, base
    type(l_bufel_), pointer :: lbuf
    real(kind=8) :: eint_sum, rho_sum

    if (zero_anod) then
      do n = 1, n_nodes
        xnod(1, n) = x(3 * (n - 1) + 1)
        xnod(2, n) = x(3 * (n - 1) + 2)
        xnod(3, n) = x(3 * (n - 1) + 3)
        vnod(1, n) = v(3 * (n - 1) + 1)
        vnod(2, n) = v(3 * (n - 1) + 2)
        vnod(3, n) = v(3 * (n - 1) + 3)
      end do
      anod = zero
      dnod = zero
      wnod = zero
    end if

    do ie = 1, pnel
      ig = ie0 + ie
      do a = 1, 8
        ixs(1 + a, ie) = conn(8 * (ig - 1) + a) + 1
      end do
      ixs(1, ie) = 1
      ixs(10, ie) = 1
      ixs(11, ie) = ig
      elbuf_tab(1)%gbuf%off(ie) = offg_io(ig)
      do k = 1, 21
        elbuf_tab(1)%gbuf%smstr(ie + (k - 1) * pnel) = smstr_io(21 * (ig - 1) + k)
      end do
      if (associated(elbuf_tab(1)%gbuf%pla)) elbuf_tab(1)%gbuf%pla(ie) = zero
      if (associated(elbuf_tab(1)%gbuf%sig)) then
        do k = 1, 6
          elbuf_tab(1)%gbuf%sig(ie + (k - 1) * pnel) = zero
        end do
      end if
    end do

    do ie = 1, pnel
      ig = ie0 + ie
      base = 48 * (ig - 1)
      eint_sum = zero
      rho_sum = zero
      do it = 1, 2
        do is = 1, 2
          do ir = 1, 2
            ip = ir + ((is - 1) + (it - 1) * 2) * 2
            lbuf => elbuf_tab(1)%bufly(1)%lbuf(ir, is, it)
            do k = 1, 6
              lbuf%sig(ie + (k - 1) * pnel) = stress_io(base + 6 * (ip - 1) + k)
            end do
            lbuf%pla(ie) = eqps_io(8 * (ig - 1) + ip)
            lbuf%vol(ie) = vol0_io(8 * (ig - 1) + ip)
            lbuf%vol0dp(ie) = vol0_io(8 * (ig - 1) + ip)
            lbuf%eint(ie) = hist_io(32 * (ig - 1) + ip)
            lbuf%epsd(ie) = hist_io(32 * (ig - 1) + 8 + ip)
            lbuf%qvis(ie) = hist_io(32 * (ig - 1) + 16 + ip)
            lbuf%rho(ie) = hist_io(32 * (ig - 1) + 24 + ip)
            lbuf%off(ie) = one
            eint_sum = eint_sum + lbuf%eint(ie)
            rho_sum = rho_sum + lbuf%rho(ie)
            if (associated(lbuf%sigb)) then
              do k = 1, 6
                lbuf%sigb(ie + (k - 1) * pnel) = zero
              end do
            end if
            if (associated(lbuf%stra)) then
              do k = 1, 6
                lbuf%stra(ie + (k - 1) * pnel) = zero
              end do
            end if
          end do
        end do
      end do
      elbuf_tab(1)%gbuf%eint(ie) = eint_sum * 0.125d0
      elbuf_tab(1)%gbuf%rho(ie) = rho_sum * 0.125d0
      elbuf_tab(1)%gbuf%qvis(ie) = zero
      elbuf_tab(1)%gbuf%epsd(ie) = zero
    end do
    iparg(2, 1) = pnel
  end subroutine pack_packet

  subroutine scatter_mesh(n_hex, stress_io, eqps_io, vol0_io, smstr_io, offg_io, hist_io)
    integer(c_int), intent(in), value :: n_hex
    real(c_double), intent(inout) :: stress_io(48 * n_hex), eqps_io(8 * n_hex), vol0_io(8 * n_hex)
    real(c_double), intent(inout) :: smstr_io(21 * n_hex), offg_io(n_hex), hist_io(32 * n_hex)
    integer :: ie, ir, is, it, ip, k, base, nel
    type(l_bufel_), pointer :: lbuf

    nel = n_hex
    do ie = 1, nel
      base = 48 * (ie - 1)
      do it = 1, 2
        do is = 1, 2
          do ir = 1, 2
            ip = ir + ((is - 1) + (it - 1) * 2) * 2
            lbuf => elbuf_tab(1)%bufly(1)%lbuf(ir, is, it)
            do k = 1, 6
              stress_io(base + 6 * (ip - 1) + k) = lbuf%sig(ie + (k - 1) * nel)
            end do
            eqps_io(8 * (ie - 1) + ip) = lbuf%pla(ie)
            vol0_io(8 * (ie - 1) + ip) = lbuf%vol(ie)
            hist_io(32 * (ie - 1) + ip) = lbuf%eint(ie)
            hist_io(32 * (ie - 1) + 8 + ip) = lbuf%epsd(ie)
            hist_io(32 * (ie - 1) + 16 + ip) = lbuf%qvis(ie)
            hist_io(32 * (ie - 1) + 24 + ip) = lbuf%rho(ie)
          end do
        end do
      end do
      offg_io(ie) = elbuf_tab(1)%gbuf%off(ie)
      do k = 1, 21
        smstr_io(21 * (ie - 1) + k) = elbuf_tab(1)%gbuf%smstr(ie + (k - 1) * nel)
      end do
    end do
  end subroutine scatter_mesh

  subroutine scatter_packet(ie0, pnel, n_hex, stress_io, eqps_io, vol0_io, smstr_io, offg_io, hist_io)
    integer, intent(in) :: ie0, pnel, n_hex
    real(c_double), intent(inout) :: stress_io(48 * n_hex), eqps_io(8 * n_hex), vol0_io(8 * n_hex)
    real(c_double), intent(inout) :: smstr_io(21 * n_hex), offg_io(n_hex), hist_io(32 * n_hex)
    integer :: ie, ig, ir, is, it, ip, k, base
    type(l_bufel_), pointer :: lbuf

    do ie = 1, pnel
      ig = ie0 + ie
      base = 48 * (ig - 1)
      do it = 1, 2
        do is = 1, 2
          do ir = 1, 2
            ip = ir + ((is - 1) + (it - 1) * 2) * 2
            lbuf => elbuf_tab(1)%bufly(1)%lbuf(ir, is, it)
            do k = 1, 6
              stress_io(base + 6 * (ip - 1) + k) = lbuf%sig(ie + (k - 1) * pnel)
            end do
            eqps_io(8 * (ig - 1) + ip) = lbuf%pla(ie)
            vol0_io(8 * (ig - 1) + ip) = lbuf%vol(ie)
            hist_io(32 * (ig - 1) + ip) = lbuf%eint(ie)
            hist_io(32 * (ig - 1) + 8 + ip) = lbuf%epsd(ie)
            hist_io(32 * (ig - 1) + 16 + ip) = lbuf%qvis(ie)
            hist_io(32 * (ig - 1) + 24 + ip) = lbuf%rho(ie)
          end do
        end do
      end do
      offg_io(ig) = elbuf_tab(1)%gbuf%off(ie)
      do k = 1, 21
        smstr_io(21 * (ig - 1) + k) = elbuf_tab(1)%gbuf%smstr(ie + (k - 1) * pnel)
      end do
    end do
  end subroutine scatter_packet

  function env_call_s8e() result(yes)
    logical :: yes
    character(len=8) :: val
    integer :: n, ierr
    yes = .false.
    call get_environment_variable('WMBD_OR_CALL_S8E', val, length=n, status=ierr)
    if (ierr == 0 .and. n > 0) then
      if (val(1:1) == '1' .or. val(1:1) == 'y' .or. val(1:1) == 'Y') yes = .true.
    end if
  end function env_call_s8e

  subroutine call_s8e_packet(nel)
    integer, intent(in) :: nel
    real(kind=8) :: dt2t
    integer :: ng, icp, offset, nvc, itask, istrain, iexpan, h3d_strain
    integer :: neltst, ityptst, ioutprt
    integer :: snpc, stf, sbufmat, nsvois, idtmins, iresp, maxfunc
    integer :: userl_avail, impl_s, idyna
    external s8eforc3

    ng = 1
    icp = 1
    offset = 0
    nvc = 0
    itask = 0
    istrain = 0
    iexpan = 0
    h3d_strain = 0
    neltst = 0
    ityptst = 0
    ioutprt = 0
    dt2t = 1.0d30
    snpc = 1
    stf = 1
    sbufmat = 1
    nsvois = 0
    idtmins = 0
    iresp = 0
    maxfunc = 0
    userl_avail = 0
    impl_s = 0
    idyna = 0
    dt_t%idel_brick = 0
    sensors%stabsen = 0
    f11 = zero; f21 = zero; f31 = zero
    f12 = zero; f22 = zero; f32 = zero
    f13 = zero; f23 = zero; f33 = zero
    f14 = zero; f24 = zero; f34 = zero
    f15 = zero; f25 = zero; f35 = zero
    f16 = zero; f26 = zero; f36 = zero
    f17 = zero; f27 = zero; f37 = zero
    f18 = zero; f28 = zero; f38 = zero
    voln = zero
    svis = zero
    xdp = 0.0d0
    iads = 0
    iparts = 1
    npf = 0
    grth = 0
    igrth = 0

    call s8eforc3(timers, output, elbuf_tab, ng, pm, geo, ixs, xnod, anod, vnod, &
         ms, wnod, flu1, veul, fv, ale_connect, iparg, tf, npf, bufmat, partsav, &
         nloc_dmg, dt2t, neltst, ityptst, stifn, fsky, iads, offset, eani, iparts, icp, &
         f11, f21, f31, f12, f22, f32, f13, f23, f33, f14, f24, f34, &
         f15, f25, f35, f16, f26, f36, f17, f27, f37, f18, f28, f38, &
         nel, nvc, ipm, itask, istrain, temp, fthe, fthesky, iexpan, gresav, grth, igrth, &
         mssa, dmels, table, igeo, xdp, voln, condn, condnsky, dnod, sensors, ioutprt, &
         mat_elem, h3d_strain, dt_t, snpc, stf, sbufmat, svis, nsvois, idtmins, iresp, &
         maxfunc, userl_avail, glob_therm, impl_s, idyna)
  end subroutine call_s8e_packet

  function wmbd_mesh_internal_forces_or(n_hex, n_nodes, x, v, conn, mat, stress_io, eqps_io, vol0_io, &
       smstr_io, offg_io, hist_io, dt, f_out) result(rc) bind(C, name='wmbd_mesh_internal_forces_or')
    integer(c_int), intent(in), value :: n_hex, n_nodes
    real(c_double), intent(in) :: x(3 * n_nodes), v(3 * n_nodes)
    integer(c_int), intent(in) :: conn(8 * n_hex)
    type(wmbd_mat_mesh_c), intent(in) :: mat
    real(c_double), intent(inout) :: stress_io(48 * n_hex)
    real(c_double), intent(inout) :: eqps_io(8 * n_hex)
    real(c_double), intent(inout) :: vol0_io(8 * n_hex)
    real(c_double), intent(inout) :: smstr_io(21 * n_hex)
    real(c_double), intent(inout) :: offg_io(n_hex)
    real(c_double), intent(inout) :: hist_io(32 * n_hex)
    real(c_double), intent(in), value :: dt
    real(c_double), intent(out) :: f_out(3 * n_nodes)
    integer(c_int) :: rc

    interface
      subroutine wmbd_or_set_dt1(dt1) bind(C, name='wmbd_or_set_dt1')
        import :: c_double
        real(c_double), intent(in), value :: dt1
      end subroutine
    end interface

    integer :: n, ie0, pnel, buf_nel
    logical :: multi

    f_out = 0
    if (n_hex < 1 .or. n_hex > max_hex_c .or. n_nodes < 8) then
      rc = -5_c_int
      return
    end if

    multi = n_hex > max_nel_c
    buf_nel = merge(max_nel_c, n_hex, multi)

    call wmbd_or_init_commons()
    call wmbd_or_set_dt1(dt)

    if (.not. mesh_ready) then
      if (.not. alloc_mesh_elbuf(mat, buf_nel, n_nodes)) then
        rc = -4_c_int
        return
      end if
      mesh_ready = .true.
    else if (mesh_numnod /= n_nodes .or. mesh_buf_nel /= buf_nel) then
      ! Buffer sized for a different mesh mode/size — refuse rather than leak.
      rc = -5_c_int
      return
    end if

    if (.not. env_call_s8e()) then
      rc = -2_c_int
      return
    end if

    if (.not. multi) then
      call wmbd_or_set_group(n_nodes, n_hex)
      call pack_mesh(n_hex, n_nodes, x, v, conn, stress_io, eqps_io, vol0_io, smstr_io, offg_io, hist_io)
      call call_s8e_packet(n_hex)
      call scatter_mesh(n_hex, stress_io, eqps_io, vol0_io, smstr_io, offg_io, hist_io)
    else
      ! Live FORINT order: groups of ≤MVSIZ in element order; A accumulates.
      ie0 = 0
      do while (ie0 < n_hex)
        pnel = min(max_nel_c, n_hex - ie0)
        call wmbd_or_set_group(n_nodes, pnel)
        call pack_packet(ie0, pnel, n_hex, n_nodes, x, v, conn, &
             stress_io, eqps_io, vol0_io, smstr_io, offg_io, hist_io, ie0 == 0)
        call call_s8e_packet(pnel)
        call scatter_packet(ie0, pnel, n_hex, stress_io, eqps_io, vol0_io, &
             smstr_io, offg_io, hist_io)
        ie0 = ie0 + pnel
      end do
    end if

    do n = 1, n_nodes
      f_out(3 * (n - 1) + 1) = anod(1, n)
      f_out(3 * (n - 1) + 2) = anod(2, n)
      f_out(3 * (n - 1) + 3) = anod(3, n)
    end do
    rc = 0_c_int
  end function wmbd_mesh_internal_forces_or

end module wmbd_or_mesh_force_mod
