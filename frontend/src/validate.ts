import type { Reservation } from './api'
import { CLOSE, OPEN, UNIT, addDays, earliestStart, formatMinutes, minutesOf } from './time'

/** 予約する小窓に入力した内容。時刻は「0 時からの分」。 */
export type Form = {
  roomId: number
  date: string
  start: number
  end: number
  purpose: string
}

type Context = {
  today: string
  nowMinutes: number
  /** その日（form.date）のすでにある予約。まだ読み込んでいないときは null（重なりは API が調べる） */
  existing: Reservation[] | null
}

const MAX_DAYS_AHEAD = 90
const MAX_LENGTH = 4 * 60

/**
 * 送る前の検査。文は API（backend の ReservationRules）と同じ決まり・同じ言い方にしてある。
 * 問題なければ null、あれば画面に出す 1 文を返す。最終的な判断は API が行う。
 */
export function validateForm(form: Form, { today, nowMinutes, existing }: Context): string | null {
  if (!form.date) return '日付を選んでください'
  if (form.end <= form.start) return '終了は開始より後にしてください'
  if (form.start < OPEN || form.end > CLOSE) {
    return `予約できる時間は ${formatMinutes(OPEN)}〜${formatMinutes(CLOSE)} です`
  }
  const first = earliestStart(form.date, today, nowMinutes)
  if (form.start < first) {
    return form.date === today ? `今日は ${formatMinutes(first)} 以降から予約できます` : '過去の時間は予約できません'
  }
  if (form.date > addDays(today, MAX_DAYS_AHEAD)) return '予約できるのは今日から 90 日先までです'
  if (form.end - form.start > MAX_LENGTH) return '1 件の予約は 4 時間までです'
  const overlapped = existing?.some(
    (r) => r.roomId === form.roomId && minutesOf(r.startAt) < form.end && minutesOf(r.endAt) > form.start,
  )
  if (overlapped) return 'その時間はすでに予約があります'
  return null
}

/** 空き枠を押したときの終了時刻。30 分（1 枠）。空き枠は押せるので、次の予約や閉館を越えない。 */
export function defaultEnd(start: number): number {
  return Math.min(CLOSE, start + UNIT)
}
