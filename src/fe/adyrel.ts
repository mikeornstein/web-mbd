/**
 * OpenRadioss `/ADYREL` as written in engine `static.F`:
 * ENER_W0 BETATE + STATIC ISTAT=1 acceleration update.
 * No invented BETATE gain. Butterworth off (FREQ_C default 0).
 */

/** ENER_W0 NC_ACT — first BETATE after this many cycles. */
export const ADYREL_NC_ACT = 200;

/**
 * OpenRadioss ENER_W0 KE-update gate (`THREE_HALF`). Not a toy calibration
 * multiplier on the A-update.
 */
const ENER_W0_KE_THREE_HALF = 1.5;
const EI_TOL = 1e-12;
const KE_OVER_IE_GATE = 1e-3;

export interface AdyrelState {
  betate: number;
  ifirst: number;
  pimax: number;
  pcmax: number;
  pint: number;
  pcin: number;
  eint0: number;
  encin0: number;
}

export function createAdyrelState(): AdyrelState {
  return {
    betate: 0,
    ifirst: 0,
    pimax: 0,
    pcmax: 0,
    pint: 0,
    pcin: 0,
    eint0: 0,
    encin0: 0,
  };
}

/**
 * E_PERIOD + ENER_W0. `dt` is Radioss DT1. `ncycle` is 1-based step count
 * after the increment (OpenRadioss NCYCLE).
 */
export function stepEnerW0(
  state: AdyrelState,
  args: { ke: number; ie: number; dt: number; ncycle: number },
): void {
  const { ke, ie, dt, ncycle } = args;
  if (!(dt > 0) || ncycle <= 0) return;

  state.pcin += dt;
  state.pint += dt;
  state.pimax = Math.max(state.pimax, state.pint);
  state.pcmax = Math.max(state.pcmax, state.pcin);

  let ipc = 0;
  let ipi = 0;
  if (ke < state.encin0 && ke >= 0) {
    state.encin0 = 0;
    state.pcin = 0;
    ipc = 1;
  } else {
    state.encin0 = ke;
  }
  if (ie < 0) {
    state.eint0 = 0;
    state.pint = 0;
    ipi = -2;
  } else if (ie < state.eint0 && ie >= 0) {
    state.eint0 = 0;
    state.pint = 0;
    ipi = 1;
  } else {
    state.eint0 = ie;
  }

  const fMax = 0.01 / dt;
  const f0 = 0.01 * fMax;
  let ifirst = state.ifirst;

  if (ipi === 1) {
    const fi = state.pimax > 0 ? 1 / state.pimax : fMax;
    const bn = Math.min(fMax, fi);
    if (state.betate === 0 && state.eint0 > EI_TOL) {
      if (ncycle >= ADYREL_NC_ACT) {
        state.betate = Math.min(f0, bn);
        ifirst = 1;
      }
    } else if (ifirst === 1) {
      state.betate = bn;
      ifirst += 1;
    } else if (ifirst >= 2) {
      state.betate = Math.min(state.betate, bn);
    }
  }

  if (ipc === 1) {
    const fc = state.pcmax > 0 ? 1 / state.pcmax : fMax;
    const bn = Math.min(fMax, fc);
    if (state.betate === 0 && state.eint0 > EI_TOL) {
      if (ncycle >= ADYREL_NC_ACT) {
        state.betate = Math.min(f0, bn);
        ifirst = 1;
      }
    } else if (ifirst === 1) {
      state.betate = bn;
      ifirst += 1;
    } else if (ifirst >= 2) {
      if (
        state.encin0 / Math.max(1e-20, state.eint0) > KE_OVER_IE_GATE &&
        state.betate < bn * ENER_W0_KE_THREE_HALF
      ) {
        const half = 0.5 * state.betate;
        state.betate = Math.min(state.betate, bn);
        state.betate = Math.max(state.betate, half);
      }
    }
  }

  if (state.betate === 0 && state.eint0 > EI_TOL && ncycle >= ADYREL_NC_ACT) {
    state.betate = f0;
    ifirst = 1;
  }
  if (ifirst >= 1 && ipc + ipi === 0) {
    const denom = Math.max(state.pimax, state.pcmax);
    if (denom > 0) {
      const fi = 1 / denom;
      if (state.betate > 1.1 * fi) state.betate = fi;
    }
  }
  state.ifirst = ifirst;
}

/** STATIC ISTAT=1: A := (1 − β DT12) A − 2β V. No gain on β. */
export function applyAdyrelAcceleration(
  acc: Float64Array,
  v: Float64Array,
  betate: number,
  dt12: number,
): void {
  if (!(betate > 0)) return;
  const omega = betate * dt12;
  const uomega = 1 - omega;
  const domega = 2 * betate;
  for (let i = 0; i < acc.length; i++) {
    acc[i] = uomega * acc[i]! - domega * v[i]!;
  }
}
