! or_hex_force.F90 — BIND(C) entry packing one Taylor hex into OR ELBUF and
! optionally calling S8EFORC3.
!
! Return codes:
!   0  = S8EFORC3 ran and forces collected
!  -2  = commons + ELBUF packed (S8E not called; set WMBD_OR_CALL_S8E=1 to try)
!  -4  = packing/alloc failure
!
! Build: relink-or-hex.sh (same .so as engine objects so commons share).

module wmbd_or_hex_force_mod
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

  type, bind(C) :: wmbd_mat_c
     real(c_double) :: density
     real(c_double) :: young
     real(c_double) :: poisson
     real(c_double) :: yield_stress
     real(c_double) :: hardening
  end type wmbd_mat_c

  logical, save :: pack_ready = .false.
  integer, parameter :: ngroup_c = 1
  integer, parameter :: nummat_c = 1
  integer, parameter :: numgeo_c = 1
  integer, parameter :: numnod_c = 8
  integer, parameter :: mvsiz_c = 129

  type(elbuf_struct_), target, save :: elbuf_tab(ngroup_c)
  type(matparam_struct_), target, save :: mat_param_arr(nummat_c)
  type(mat_elem_), save :: mat_elem

  integer, save :: nparg_s, npropm_s, npropg_s, npropgi_s, npropmi_s
  integer, allocatable, save :: iparg(:,:)
  integer, allocatable, save :: ixs(:,:)
  integer, allocatable, save :: ipm(:,:)
  integer, allocatable, save :: igeo(:,:)
  real(kind=8), allocatable, save :: pm(:,:)
  real(kind=8), allocatable, save :: geo(:,:)
  real(kind=8), allocatable, save :: xnod(:,:)
  real(kind=8), allocatable, save :: vnod(:,:)
  real(kind=8), allocatable, save :: anod(:,:)
  real(kind=8), allocatable, save :: dnod(:,:)
  real(kind=8), allocatable, save :: wnod(:,:)
  real(kind=8), allocatable, save :: ms(:)
  real(kind=8), allocatable, save :: stifn(:)

  ! Heap/module storage — OUTPUT_/TIMER_ and MVSIZ collectors are too large for
  ! Node's default JS-thread stack when calling through koffi.
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
  integer, save :: npf(1), iads(8, 1), iparts(1), grth(1), igrth(1)
  double precision, save :: xdp(3, 8)

  interface
    subroutine wmbd_or_init_commons()
    end subroutine wmbd_or_init_commons

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

  function alloc_taylor_elbuf(mat) result(ok)
    type(wmbd_mat_c), intent(in) :: mat
    logical :: ok
    integer :: ir, is, it, ng, nlay, nptr, npts, nptt, nintlay, nel, npt, ity, igtyp
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
    nel = 1
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

    elbuf_tab(ng)%gbuf%off(1) = one
    elbuf_tab(ng)%gbuf%rho(1) = rho0
    elbuf_tab(ng)%gbuf%fill(1) = one
    elbuf_tab(ng)%gbuf%vol(1) = zero
    do ir = 1, nptr
      do is = 1, npts
        do it = 1, nptt
          elbuf_tab(ng)%bufly(1)%lbuf(ir, is, it)%off(1) = one
          elbuf_tab(ng)%bufly(1)%lbuf(ir, is, it)%rho(1) = rho0
        end do
      end do
    end do

    allocate(iparg(nparg_s, ngroup_c), source=0)
    allocate(ixs(nixs, 1), source=0)
    allocate(ipm(npropmi_s, nummat_c), source=0)
    allocate(igeo(npropgi_s, numgeo_c), source=0)
    allocate(pm(npropm_s, nummat_c), source=0.0_8)
    allocate(geo(npropg_s, numgeo_c), source=0.0_8)
    allocate(xnod(3, numnod_c), source=0.0_8)
    allocate(vnod(3, numnod_c), source=0.0_8)
    allocate(anod(3, numnod_c), source=0.0_8)
    allocate(dnod(3, numnod_c), source=0.0_8)
    allocate(wnod(3, numnod_c), source=0.0_8)
    allocate(ms(numnod_c), source=0.0_8)
    allocate(stifn(numnod_c), source=0.0_8)

    iparg(1, 1) = 2
    iparg(2, 1) = 1
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
    iparg(37, 1) = 1
    iparg(38, 1) = 14
    iparg(56, 1) = 2
    iparg(57, 1) = 2
    iparg(58, 1) = 2
    iparg(59, 1) = 1
    iparg(72, 1) = 0
    iparg(78, 1) = 0

    ixs(1, 1) = 1
    do ir = 1, 8
      ixs(1 + ir, 1) = ir
    end do
    ixs(10, 1) = 1
    ixs(11, 1) = 1

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
    geo(14, 1) = zero
    geo(15, 1) = zero

    ok = .true.
  end function alloc_taylor_elbuf

  subroutine pack_state(x0, v0, stress_io, eqps_io, vol0_io, smstr_io, offg_io, hist_io, mat)
    real(c_double), intent(in) :: x0(24), v0(24)
    real(c_double), intent(in) :: stress_io(48), eqps_io(8), vol0_io(8)
    real(c_double), intent(in) :: smstr_io(21)
    real(c_double), intent(in), value :: offg_io
    ! hist_io: eint[8], epsd[8], qvis[8], rho[8] — per-GP ELBUF history for the shared one-hex buffer
    real(c_double), intent(in) :: hist_io(32)
    type(wmbd_mat_c), intent(in) :: mat
    integer :: n, ir, is, it, ip, k
    type(l_bufel_), pointer :: lbuf
    real(kind=8) :: eint_sum, rho_sum

    do n = 1, 8
      xnod(1, n) = x0(3 * (n - 1) + 1)
      xnod(2, n) = x0(3 * (n - 1) + 2)
      xnod(3, n) = x0(3 * (n - 1) + 3)
      vnod(1, n) = v0(3 * (n - 1) + 1)
      vnod(2, n) = v0(3 * (n - 1) + 2)
      vnod(3, n) = v0(3 * (n - 1) + 3)
    end do
    anod = zero
    dnod = zero
    wnod = zero

    elbuf_tab(1)%gbuf%off(1) = offg_io
    do k = 1, 21
      elbuf_tab(1)%gbuf%smstr(k) = smstr_io(k)
    end do
    if (associated(elbuf_tab(1)%gbuf%pla)) elbuf_tab(1)%gbuf%pla(1) = zero
    if (associated(elbuf_tab(1)%gbuf%sig)) elbuf_tab(1)%gbuf%sig = zero

    eint_sum = zero
    rho_sum = zero
    ! Match S8EFORC3: IP = IR + ((IS-1)+(IT-1)*NPTS)*NPTR with NPTR=NPTS=NPTT=2
    ! (ξ / IR fastest — same as web-mbd RADIOSS_GAUSS / s8eprst_ini KSI).
    do it = 1, 2
      do is = 1, 2
        do ir = 1, 2
          ip = ir + ((is - 1) + (it - 1) * 2) * 2
          lbuf => elbuf_tab(1)%bufly(1)%lbuf(ir, is, it)
          do k = 1, 6
            lbuf%sig(k) = stress_io(6 * (ip - 1) + k)
          end do
          lbuf%pla(1) = eqps_io(ip)
          lbuf%vol(1) = vol0_io(ip)
          lbuf%vol0dp(1) = vol0_io(ip)
          lbuf%eint(1) = hist_io(ip)
          lbuf%epsd(1) = hist_io(8 + ip)
          lbuf%qvis(1) = hist_io(16 + ip)
          lbuf%rho(1) = hist_io(24 + ip)
          lbuf%off(1) = one
          eint_sum = eint_sum + lbuf%eint(1)
          rho_sum = rho_sum + lbuf%rho(1)
          if (associated(lbuf%sigb)) lbuf%sigb = zero
          if (associated(lbuf%stra)) lbuf%stra = zero
        end do
      end do
    end do
    elbuf_tab(1)%gbuf%eint(1) = eint_sum * 0.125d0
    elbuf_tab(1)%gbuf%rho(1) = rho_sum * 0.125d0
    elbuf_tab(1)%gbuf%qvis(1) = zero
    elbuf_tab(1)%gbuf%epsd(1) = zero
  end subroutine pack_state

  subroutine scatter_state(stress_io, eqps_io, vol0_io, smstr_io, offg_io, hist_io, f11, f21, f31, f12, f22, f32, &
       f13, f23, f33, f14, f24, f34, f15, f25, f35, f16, f26, f36, f17, f27, f37, &
       f18, f28, f38, f_out)
    real(c_double), intent(inout) :: stress_io(48), eqps_io(8), vol0_io(8)
    real(c_double), intent(inout) :: smstr_io(21)
    real(c_double), intent(out) :: offg_io
    real(c_double), intent(inout) :: hist_io(32)
    real(kind=8), intent(in) :: f11(:), f21(:), f31(:), f12(:), f22(:), f32(:)
    real(kind=8), intent(in) :: f13(:), f23(:), f33(:), f14(:), f24(:), f34(:)
    real(kind=8), intent(in) :: f15(:), f25(:), f35(:), f16(:), f26(:), f36(:)
    real(kind=8), intent(in) :: f17(:), f27(:), f37(:), f18(:), f28(:), f38(:)
    real(c_double), intent(out) :: f_out(24)
    integer :: ir, is, it, ip, k
    type(l_bufel_), pointer :: lbuf

    do it = 1, 2
      do is = 1, 2
        do ir = 1, 2
          ip = ir + ((is - 1) + (it - 1) * 2) * 2
          lbuf => elbuf_tab(1)%bufly(1)%lbuf(ir, is, it)
          do k = 1, 6
            stress_io(6 * (ip - 1) + k) = lbuf%sig(k)
          end do
          eqps_io(ip) = lbuf%pla(1)
          vol0_io(ip) = lbuf%vol(1)
          hist_io(ip) = lbuf%eint(1)
          hist_io(8 + ip) = lbuf%epsd(1)
          hist_io(16 + ip) = lbuf%qvis(1)
          hist_io(24 + ip) = lbuf%rho(1)
        end do
      end do
    end do

    offg_io = elbuf_tab(1)%gbuf%off(1)
    do k = 1, 21
      smstr_io(k) = elbuf_tab(1)%gbuf%smstr(k)
    end do

    ! OpenRadioss F11..F38 are the FORINT collectors that later enter A as
    ! A -= F / m. web-mbd / C-mirror ABI returns +∫Bᵀσ, so negate here.
    f_out(1:3) = -[f11(1), f21(1), f31(1)]
    f_out(4:6) = -[f12(1), f22(1), f32(1)]
    f_out(7:9) = -[f13(1), f23(1), f33(1)]
    f_out(10:12) = -[f14(1), f24(1), f34(1)]
    f_out(13:15) = -[f15(1), f25(1), f35(1)]
    f_out(16:18) = -[f16(1), f26(1), f36(1)]
    f_out(19:21) = -[f17(1), f27(1), f37(1)]
    f_out(22:24) = -[f18(1), f28(1), f38(1)]
  end subroutine scatter_state

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

  function wmbd_hex_internal_forces_or(x0, v0, mat, stress_io, eqps_io, vol0_io, smstr_io, offg_io, hist_io, dt, f_out) &
       result(rc) bind(C, name='wmbd_hex_internal_forces_or')
    real(c_double), intent(in) :: x0(24)
    real(c_double), intent(in) :: v0(24)
    type(wmbd_mat_c), intent(in) :: mat
    real(c_double), intent(inout) :: stress_io(48)
    real(c_double), intent(inout) :: eqps_io(8)
    real(c_double), intent(inout) :: vol0_io(8)
    real(c_double), intent(inout) :: smstr_io(21)
    real(c_double), intent(inout) :: offg_io
    real(c_double), intent(inout) :: hist_io(32)
    real(c_double), intent(in), value :: dt
    real(c_double), intent(out) :: f_out(24)
    integer(c_int) :: rc

    interface
      subroutine wmbd_or_set_dt1(dt1) bind(C, name='wmbd_or_set_dt1')
        import :: c_double
        real(c_double), intent(in), value :: dt1
      end subroutine
    end interface

    real(kind=8) :: dt2t
    integer :: ng, nel, icp, offset, nvc, itask, istrain, iexpan, h3d_strain
    integer :: neltst, ityptst, ioutprt
    integer :: snpc, stf, sbufmat, nsvois, idtmins, iresp, maxfunc
    integer :: userl_avail, impl_s, idyna

    external s8eforc3

    f_out = 0
    call wmbd_or_init_commons()
    call wmbd_or_set_dt1(dt)

    if (.not. pack_ready) then
      if (.not. alloc_taylor_elbuf(mat)) then
        rc = -4_c_int
        return
      end if
      pack_ready = .true.
    end if

    call pack_state(x0, v0, stress_io, eqps_io, vol0_io, smstr_io, offg_io, hist_io, mat)

    if (.not. env_call_s8e()) then
      rc = -2_c_int
      return
    end if

    ng = 1
    nel = 1
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

    call scatter_state(stress_io, eqps_io, vol0_io, smstr_io, offg_io, hist_io, f11, f21, f31, f12, f22, f32, &
         f13, f23, f33, f14, f24, f34, f15, f25, f35, f16, f26, f36, f17, f27, f37, &
         f18, f28, f38, f_out)
    rc = 0_c_int
  end function wmbd_hex_internal_forces_or

end module wmbd_or_hex_force_mod
