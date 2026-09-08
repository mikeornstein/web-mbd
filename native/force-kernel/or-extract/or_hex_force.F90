! or_hex_force.F90 — BIND(C) entry for web-mbd ↔ OpenRadioss H8C force.
! Compiled INTO the same shared library as libor_h8c objects so /COM08/ etc. share.
!
! Status: skeleton. Sets DT1 and returns -1 until ELBUF/IPARG/PM packing lands.
! See or-extract/README.md packing checklist.

module wmbd_or_hex_force_mod
  use, intrinsic :: iso_c_binding
  implicit none

  type, bind(C) :: wmbd_mat_c
     real(c_double) :: density
     real(c_double) :: young
     real(c_double) :: poisson
     real(c_double) :: yield_stress
     real(c_double) :: hardening
  end type wmbd_mat_c

contains

  ! Returns 0 on success, -1 until S8EFORC3 packing is complete.
  function wmbd_hex_internal_forces_or(x0, v0, mat, stress_io, eqps_io, vol0_io, dt, f_out) &
       result(rc) bind(C, name="wmbd_hex_internal_forces_or")
    use, intrinsic :: iso_c_binding
    implicit none
    real(c_double), intent(in) :: x0(24)
    real(c_double), intent(in) :: v0(24)
    type(wmbd_mat_c), intent(in) :: mat
    real(c_double), intent(inout) :: stress_io(48)
    real(c_double), intent(inout) :: eqps_io(8)
    real(c_double), intent(inout) :: vol0_io(8)
    real(c_double), intent(in), value :: dt
    real(c_double), intent(out) :: f_out(24)
    integer(c_int) :: rc

    ! Fixed-form commons via include need a .F unit; set DT1 through C helper
    ! linked in the same .so (wmbd_or_com08.c) until full packing lands.
    interface
       subroutine wmbd_or_set_dt1(dt1) bind(C, name="wmbd_or_set_dt1")
         import :: c_double
         real(c_double), intent(in), value :: dt1
       end subroutine
    end interface

    call wmbd_or_set_dt1(dt)

    ! Silence unused until packing is implemented.
    if (x0(1) /= x0(1)) f_out(1) = 0
    if (v0(1) /= v0(1)) f_out(1) = 0
    if (mat%density /= mat%density) f_out(1) = 0
    if (stress_io(1) /= stress_io(1)) f_out(1) = 0
    if (eqps_io(1) /= eqps_io(1)) f_out(1) = 0
    if (vol0_io(1) /= vol0_io(1)) f_out(1) = 0
    f_out = 0
    rc = -1_c_int
  end function wmbd_hex_internal_forces_or

end module wmbd_or_hex_force_mod
