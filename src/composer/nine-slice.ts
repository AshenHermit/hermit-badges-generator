export function tileSpan(span: number, tile: number): number {
  return Math.max(1, Math.ceil(span / tile));
}
