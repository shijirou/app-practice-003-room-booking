// 日付・時刻の計算。時刻はすべて日本時間（Asia/Tokyo）で扱う。
// 日付は "2026-11-20"、時刻は「0 時からの分」（10:30 なら 630）で持つ。

export const OPEN = 8 * 60 // 8:00
export const CLOSE = 20 * 60 // 20:00
export const UNIT = 30 // 30 分刻み

const TOKYO = 'Asia/Tokyo'
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

/** 日本時間の「今日」の日付（"2026-11-20"）。 */
export function todayInTokyo(now: Date): string {
  return partsInTokyo(now).date
}

/** 日本時間の「今」の時刻（0 時からの分）。 */
export function minutesInTokyo(now: Date): number {
  return partsInTokyo(now).minutes
}

function partsInTokyo(now: Date): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TOKYO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  }
}

function utcOf(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

/** 日付に日数を足す（引くときはマイナス）。 */
export function addDays(date: string, days: number): string {
  const d = utcOf(date)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** 0（日）〜 6（土） */
export function weekdayOf(date: string): number {
  return utcOf(date).getUTCDay()
}

/** "2026-11-20" → "2026年11月20日（金）" */
export function formatDateLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return `${y}年${m}月${d}日（${WEEKDAYS[weekdayOf(date)]}）`
}

/** "2026-11-20" → "11/20(金)" */
export function formatShortDate(date: string): string {
  const [, m, d] = date.split('-').map(Number)
  return `${m}/${d}(${WEEKDAYS[weekdayOf(date)]})`
}

/** API の日時（"2026-11-20T10:30:00+09:00"）から、日付の部分を取り出す。API は日本時間で返す。 */
export function dateOf(iso: string): string {
  return iso.slice(0, 10)
}

/** API の日時から、時刻を「0 時からの分」で取り出す。 */
export function minutesOf(iso: string): number {
  return Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16))
}

/** 日付と「0 時からの分」から、API に送る日時にする。("2026-11-20", 630) → "2026-11-20T10:30:00+09:00" */
export function isoOf(date: string, minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, '0')
  const m = String(minutes % 60).padStart(2, '0')
  return `${date}T${h}:${m}:00+09:00`
}

/** 630 → "10:30" */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

/** 予約を始められる最も早い時刻。今日は今の時刻を 30 分単位で切り上げる。過去の日は始められない（無限大）。 */
export function earliestStart(date: string, today: string, nowMinutes: number): number {
  if (date < today) return Infinity
  if (date === today) return Math.ceil(nowMinutes / UNIT) * UNIT
  return 0
}

/** 開いたときに見せる日。今日がもう予約を始められない（閉店後）なら翌日。使える日を最初から見せるため。 */
export function initialDate(today: string, nowMinutes: number): string {
  return earliestStart(today, today, nowMinutes) >= CLOSE ? addDays(today, 1) : today
}

/** 予約が終わっているか。 */
export function isFinished(date: string, endMinutes: number, today: string, nowMinutes: number): boolean {
  return date < today || (date === today && endMinutes <= nowMinutes)
}

/** 予約が始まっているか（進行中も含む）。 */
export function isStarted(date: string, startMinutes: number, today: string, nowMinutes: number): boolean {
  return date < today || (date === today && startMinutes <= nowMinutes)
}

/** カレンダー用。その月を含む 6 週間（42 日）の日付を、日曜始まりで返す。month は 1〜12。 */
export function calendarDays(year: number, month: number): string[] {
  const first = `${year}-${String(month).padStart(2, '0')}-01`
  const start = addDays(first, -weekdayOf(first))
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}
