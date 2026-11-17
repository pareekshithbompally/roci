/** Round axis ticks: 0 up to the first "nice" value (1, 2, 2.5 or 5 × 10ⁿ steps) at or above the data's maximum. */

const NICE_STEPS = [1, 2, 2.5, 5, 10];

/** `intervals` steps from 0; `integer` keeps steps whole (counts). An empty or all-zero series gets [0, 1]. */
export function niceTicks(max: number, intervals: number, integer = false): number[] {
  if (!(max > 0) || intervals < 1) return [0, 1];
  const raw = max / intervals;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const nice = NICE_STEPS.find((s) => s * magnitude >= raw) ?? 10;
  const step = integer ? Math.max(1, Math.ceil(nice * magnitude)) : nice * magnitude;
  const count = Math.ceil(max / step - 1e-9);
  return Array.from({ length: count + 1 }, (_, i) => Number((i * step).toPrecision(12)));
}
