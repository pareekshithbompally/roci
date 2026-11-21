/** A legend's colour dot: what a series or kind is drawn in, from its token (`--viz-1` …). */

export function Swatch({ token }: { token: string }) {
  return <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: `var(${token})` }} />;
}
