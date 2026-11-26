/**
 * Decide a row's reading from which value cells are punched.
 *
 * Observers either punch the score (one hole), or correct a mistake by punching every
 * value except the correct one (an "inverse" correction: four holes on a five-value card).
 *
 * | Holes | Reading                         |
 * |-------|---------------------------------|
 * | 1     | the punched value               |
 * | N - 1 | the one unpunched value, INVERSE |
 * | 0     | none, NO_PUNCH                  |
 * | other | none, MULTI_PUNCH               |
 *
 * A card profile without inverse corrections reads N - 1 holes as MULTI_PUNCH.
 *
 * Confidence is handled by the caller; this function works on decided holes only.
 */
export type RowFlag = 'NO_PUNCH' | 'MULTI_PUNCH';

export type RowDecision<V> =
  | { readonly kind: 'value'; readonly value: V; readonly inverse: boolean }
  | { readonly kind: 'flag'; readonly flag: RowFlag };

export function decodeRow<V>(
  values: readonly V[],
  punched: readonly boolean[],
  /** inverse: false for a card whose observers don't correct by marking all but one. */
  rules: { readonly inverse: boolean } = { inverse: true },
): RowDecision<V> {
  if (values.length !== punched.length) {
    throw new RangeError(`decodeRow: ${values.length} values but ${punched.length} cells`);
  }
  if (values.length < 3) {
    // With fewer than three values, "one hole" and "all but one" are indistinguishable.
    throw new RangeError('decodeRow: a card profile needs at least three value columns');
  }

  const holes = punched.filter(Boolean).length;

  if (holes === 0) return { kind: 'flag', flag: 'NO_PUNCH' };

  if (holes === 1) {
    const value = values[punched.indexOf(true)] as V;
    return { kind: 'value', value, inverse: false };
  }

  if (rules.inverse && holes === values.length - 1) {
    const value = values[punched.indexOf(false)] as V;
    return { kind: 'value', value, inverse: true };
  }

  return { kind: 'flag', flag: 'MULTI_PUNCH' };
}
