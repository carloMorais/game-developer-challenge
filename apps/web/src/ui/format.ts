/** Formats milliseconds as mm:ss, rounding up so 0:00 only shows at the very end. */
export function formatTime(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export const END_REASON_LABEL = { timeUp: 'Time up', destroyed: 'Sunk' } as const;

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const pad = (n: number) => String(n).padStart(2, '0');

/** "08 SEP · 21:42" in the viewer's time zone (locale-independent format). */
export function formatDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: `${pad(d.getDate())} ${MONTHS[d.getMonth()]}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export function formatConfig(config: { sessionTime: number; spawnInterval: number }): string {
  return `${config.sessionTime} s battles · ${config.spawnInterval} s spawn interval`;
}
