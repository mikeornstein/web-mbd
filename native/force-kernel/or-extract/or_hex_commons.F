! or_hex_commons.F — bootstrap OpenRadioss PARAM/COM01/COM04/VECT01/PARIT/TIMERI
! for a one-hex Taylor group. Fixed-form so commons includes work.
!
! Called from or_hex_force.F90 before ELBUF packing / S8EFORC3.
!
      SUBROUTINE WMBD_OR_INIT_COMMONS()
C-----------------------------------------------
#include "implicit_f.inc"
#include "com01_c.inc"
#include "com04_c.inc"
#include "com08_c.inc"
#include "param_c.inc"
#include "vect01_c.inc"
#include "parit_c.inc"
#include "timeri_c.inc"
C-----------------------------------------------
C   Size commons (match starter0.F defaults)
C-----------------------------------------------
      NPROPM  = 250
      NPROPG  = 1000
      NPARG   = 100
      NPROPGI = 850
      NPROPMI = 400
      NVSIZ   = 129
      LVEUL   = 0
C-----------------------------------------------
C   Model sizes — single hex, 8 nodes, 1 mat, 1 prop
C-----------------------------------------------
      NGROUP  = 1
      NUMNOD  = 8
      NUMELS  = 1
      NUMELS8 = 1
      NUMMAT  = 1
      NUMGEO  = 1
      NUMELQ  = 0
      NUMELC  = 0
      NUMELT  = 0
      NUMELR  = 0
      NUMELP  = 0
      NUMELTG = 0
      NPART   = 1
      NFUNCT  = 0
      NINTER  = 0
      NRWALL  = 0
      NRBODY  = 0
      NSECT   = 0
      NTABLE  = 0
      NSPMD   = 1
      NTHREAD0= 1
      NCYCLE  = 0
      ILAG    = 1
      IALE    = 0
      IEULER  = 0
C-----------------------------------------------
C   Parit / timers — IPARIT=0 → assemble into F11..F38 only
C-----------------------------------------------
      IPARIT  = 0
      NISKY   = 0
      LSKY    = 0
      IMON    = 0
      IMONM   = 0
      IMON_MAT= 0
C-----------------------------------------------
C   VECT01 — INITBUF-equivalent for H8C / LAW2 / JCVT=0 (Jaumann; matches live OR for Taylor; co-rot pack still drifts)
C-----------------------------------------------
      LFT     = 1
      LLT     = 1
      NFT     = 0
      MTN     = 2
      IAD     = 0
      ITY     = 1
      NPT     = 8
      JALE    = 0
      ISMSTR  = 4
      JEUL    = 0
      JTUR    = 0
      JTHE    = 0
      JLAG    = 1
      JMULT   = 0
      JHBE    = 17
      JIVF    = 0
      NVAUX   = 0
      JPOR    = 0
      JCVT    = 0
      JSPH    = 0
      JCLOSE  = 0
      JPLASOL = 1
      IREP    = 0
      IINT    = 1
      IHET    = 0
      IGTYP   = 14
      ISORTH  = 0
      ISORTHG = 0
      ISRAT   = 0
      ISROT   = 0
      ICSEN   = 0
      IFAILURE= 0
      JSMS    = 0
      ISPH2SOL= 0
      IPARTSPH= 0
      IGRE    = 0
      IFORMDT = 0
C-----------------------------------------------
      RETURN
      END
