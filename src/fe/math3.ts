/** Row-major 3×3 helpers. */

export function mat3Det(m: ArrayLike<number>): number {
  return (
    m[0]! * (m[4]! * m[8]! - m[5]! * m[7]!) -
    m[1]! * (m[3]! * m[8]! - m[5]! * m[6]!) +
    m[2]! * (m[3]! * m[7]! - m[4]! * m[6]!)
  );
}

export function mat3Inverse(m: ArrayLike<number>): number[] {
  const det = mat3Det(m);
  if (Math.abs(det) < 1e-30) throw new Error("singular 3×3");
  const inv = 1 / det;
  return [
    (m[4]! * m[8]! - m[5]! * m[7]!) * inv,
    (m[2]! * m[7]! - m[1]! * m[8]!) * inv,
    (m[1]! * m[5]! - m[2]! * m[4]!) * inv,
    (m[5]! * m[6]! - m[3]! * m[8]!) * inv,
    (m[0]! * m[8]! - m[2]! * m[6]!) * inv,
    (m[2]! * m[3]! - m[0]! * m[5]!) * inv,
    (m[3]! * m[7]! - m[4]! * m[6]!) * inv,
    (m[1]! * m[6]! - m[0]! * m[7]!) * inv,
    (m[0]! * m[4]! - m[1]! * m[3]!) * inv,
  ];
}

export function mat3Mul(a: ArrayLike<number>, b: ArrayLike<number>): number[] {
  const c = new Array<number>(9).fill(0);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      c[row * 3 + col] =
        a[row * 3]! * b[col]! +
        a[row * 3 + 1]! * b[3 + col]! +
        a[row * 3 + 2]! * b[6 + col]!;
    }
  }
  return c;
}

export function mat3Transpose(m: ArrayLike<number>): number[] {
  return [m[0]!, m[3]!, m[6]!, m[1]!, m[4]!, m[7]!, m[2]!, m[5]!, m[8]!];
}
