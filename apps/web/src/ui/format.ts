/** Formats milliseconds as mm:ss, rounding up so 0:00 only shows at the very end. */
export function formatTime(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export const END_REASON_LABEL = { timeUp: 'Time up', destroyed: 'Sunk' } as const;
