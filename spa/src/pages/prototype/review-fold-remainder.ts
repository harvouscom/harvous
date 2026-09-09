/** How many extra rows the Activity fold will actually open. */
export function reviewFoldRemainder(poolSize: number, shown: number): number {
  return Math.max(0, poolSize - shown);
}
