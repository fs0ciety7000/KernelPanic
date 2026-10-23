// In-game time formatting. The machine has a fixed UTC offset taken from its clock string.

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = (n: number) => String(n).padStart(2, '0');

/** "+02:00" → 120 (minutes). Defaults to 0 for Z / missing. */
export function parseOffset(iso: string): number {
  const m = iso.match(/([+-])(\d{2}):?(\d{2})$/);
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

export class GameTime {
  constructor(public offsetMin: number) {}

  /** Date whose UTC getters return local wall-clock values. */
  private local(ms: number): Date {
    return new Date(ms + this.offsetMin * 60000);
  }

  private zone(colon = false): string {
    const sign = this.offsetMin < 0 ? '-' : '+';
    const a = Math.abs(this.offsetMin);
    return `${sign}${p2(Math.floor(a / 60))}${colon ? ':' : ''}${p2(a % 60)}`;
  }

  rfc2822(ms: number): string {
    const d = this.local(ms);
    return `${DAYS[d.getUTCDay()]}, ${p2(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ${this.hms(ms)} ${this.zone()}`;
  }

  /** `date` default output: "Fri Apr 17 08:12:00 CEST 2026" */
  dateCmd(ms: number): string {
    const d = this.local(ms);
    const tz = this.offsetMin === 120 ? 'CEST' : this.offsetMin === 60 ? 'CET' : this.offsetMin === 0 ? 'UTC' : this.zone();
    return `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2)} ${this.hms(ms)} ${tz} ${d.getUTCFullYear()}`;
  }

  /** `ls -l` style: "Apr 17 08:12" */
  short(ms: number): string {
    const d = this.local(ms);
    return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2)} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
  }

  /** "2026-04-17 08:12:00" */
  iso(ms: number): string {
    const d = this.local(ms);
    return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${this.hms(ms)}`;
  }

  hms(ms: number): string {
    const d = this.local(ms);
    return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`;
  }

  hm(ms: number): string {
    return this.hms(ms).slice(0, 5);
  }
}
