// 모든 날짜 계산은 한국 시간(UTC+9) 기준이다.
// Render 서버는 UTC로 돌기 때문에, 서버 시계를 그대로 쓰면 "오늘"이 9시간 어긋난다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const OPEN_HOUR = 9;
export const CLOSE_HOUR = 18;
export const SLOT_HOURS = 3;
// 시간형 대여 칸: 09–12, 12–15, 15–18
export const SLOT_START_HOURS = [9, 12, 15] as const;

export const MAX_HOURLY_SLOTS = 2;
export const MAX_DAILY_DAYS = 7;
export const BOOKING_WINDOW_DAYS = 7;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 한국 시간 기준 날짜 문자열 (YYYY-MM-DD) */
export function kstDateOf(date: Date): string {
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function todayKst(now = new Date()): string {
  return kstDateOf(now);
}

/** 날짜 문자열에 n일을 더한다 */
export function addDays(dateStr: string, n: number): string {
  const t = Date.parse(`${dateStr}T00:00:00Z`) + n * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

/** 한국 시간으로 그 날짜의 hour시 정각 */
export function atKst(dateStr: string, hour: number): Date {
  return new Date(`${dateStr}T${String(hour).padStart(2, '0')}:00:00+09:00`);
}

/** YYYY-MM-DD 형식이고 실제로 있는 날짜인지 (2026-02-30 같은 날짜는 거른다) */
export function isValidDateStr(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
}

/** 날짜 문자열 사이의 일 수 (b - a) */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}
