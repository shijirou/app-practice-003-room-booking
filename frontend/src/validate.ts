import type { Reservation, Room } from './api'
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
export const MAX_LENGTH = 4 * 60

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

/**
 * 自分の、別の会議室の予約で、入力した時間と重なるもの（ダブルブッキングの警告用）。禁止ではなく、警告と確認だけにする（同時に押さえる使い方もあるため）。
 * 接しているだけ（10:00 終了と 10:00 開始）は重ならない。同じ会議室の重なりは、上の検査（禁止）が扱う。
 * 変更中の元の予約自体（editId）は比べない。まだ読み込んでいないときは空。
 */
export function selfOverlaps(
  form: Form,
  existing: Reservation[] | null,
  selfId: number | null,
  editId?: number,
): Reservation[] {
  if (selfId === null || existing === null) return []
  return existing.filter(
    (r) =>
      r.employeeId === selfId &&
      r.id !== editId &&
      r.roomId !== form.roomId &&
      minutesOf(r.startAt) < form.end &&
      minutesOf(r.endAt) > form.start,
  )
}

/** 空き枠を押したときの終了時刻。30 分（1 枠）。空き枠は押せるので、次の予約や閉館を越えない。 */
export function defaultEnd(start: number): number {
  return Math.min(CLOSE, start + UNIT)
}

/**
 * ［＋ 予約する］ボタンで開く小窓の初めの値。会議室の並び順で、最初に空いている 30 分を探す（first は、予約を始められる最も早い時刻）。
 * どこも空いていなければ、最初の会議室の最初の時刻（送るときに、重なりのエラーが出る）。
 */
export function firstFreeSlot(rooms: Room[], dayReservations: Reservation[], first: number): { roomId: number; start: number } | null {
  const from = Math.max(OPEN, first)
  if (rooms.length === 0 || from + UNIT > CLOSE) return null
  for (const room of rooms) {
    const inRoom = dayReservations.filter((r) => r.roomId === room.id)
    for (let start = from; start + UNIT <= CLOSE; start += UNIT) {
      const taken = inRoom.some((r) => minutesOf(r.startAt) < start + UNIT && minutesOf(r.endAt) > start)
      if (!taken) return { roomId: room.id, start }
    }
  }
  return { roomId: rooms[0].id, start: from }
}
