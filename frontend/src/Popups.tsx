import { useRef, useState, type FormEvent } from 'react'
import { errorMessage } from './useLoaded'
import type { Reservation, Room } from './api'
import { CLOSE, OPEN, UNIT, dateOf, formatDateLabel, formatMinutes, isStarted, minutesOf } from './time'
import type { Pos } from './placePopup'
import { useDismiss } from './useDismiss'
import { validateForm, type Form } from './validate'

const options = (from: number, to: number) => {
  const list = []
  for (let m = from; m <= to; m += UNIT) list.push(m)
  return list
}

type ReserveProps = {
  form: Form
  rooms: Room[]
  pos: Pos
  today: string
  nowMinutes: number
  /** 小窓の日付の予約（検査用）。まだ読み込んでいないときは null */
  existing: Reservation[] | null
  onChange: (form: Form) => void
  onClose: () => void
  /** 予約を作る。失敗したら例外を投げる（メッセージを小窓に出す） */
  onSubmit: (form: Form) => Promise<void>
}

/** 予約する小窓。入力のたびに、表へ仮表示が出る（form は親が持つ）。 */
export function ReservePopup({ form, rooms, pos, today, nowMinutes, existing, onChange, onClose, onSubmit }: ReserveProps) {
  const box = useRef<HTMLDialogElement>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useDismiss(true, box, onClose)

  const setStart = (start: number) => {
    const end = form.end > start ? form.end : Math.min(start + 60, CLOSE)
    onChange({ ...form, start, end })
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    const message = validateForm(form, { today, nowMinutes, existing })
    setError(message ?? '')
    if (message) return
    setBusy(true)
    try {
      await onSubmit(form)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <dialog open ref={box} className="pop" aria-label="予約" style={{ left: pos.left, top: pos.top }}>
      <form onSubmit={submit}>
        <div className="pop-head">
          <strong>予約する</strong>
          <button type="button" className="x" aria-label="閉じる" onClick={onClose}>
            ×
          </button>
        </div>
        {error && (
          <div className="err" role="alert">
            {error}
          </div>
        )}
        <div className="prow">
          <label htmlFor="p_room">会議室</label>
          <select id="p_room" value={form.roomId} onChange={(e) => onChange({ ...form, roomId: Number(e.target.value) })}>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}（{r.capacity}名）
              </option>
            ))}
          </select>
        </div>
        <div className="prow">
          <label htmlFor="p_date">日付</label>
          <input id="p_date" type="date" value={form.date} onChange={(e) => onChange({ ...form, date: e.target.value })} />
        </div>
        <div className="prow">
          <label htmlFor="p_start">時間</label>
          <div className="times">
            <select id="p_start" aria-label="開始" value={form.start} onChange={(e) => setStart(Number(e.target.value))}>
              {options(OPEN, CLOSE - UNIT).map((m) => (
                <option key={m} value={m}>
                  {formatMinutes(m)}
                </option>
              ))}
            </select>
            <span>〜</span>
            <select
              aria-label="終了"
              value={form.end}
              onChange={(e) => onChange({ ...form, end: Number(e.target.value) })}
            >
              {options(form.start + UNIT, CLOSE).map((m) => (
                <option key={m} value={m}>
                  {formatMinutes(m)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="prow">
          <label htmlFor="p_purpose">用件</label>
          <input
            id="p_purpose"
            type="text"
            maxLength={50}
            placeholder="任意（50 文字まで）"
            value={form.purpose}
            onChange={(e) => onChange({ ...form, purpose: e.target.value })}
          />
        </div>
        <div className="pbtns">
          <button type="button" onClick={onClose}>
            やめる
          </button>
          <button type="submit" className="primary" disabled={busy}>
            予約する
          </button>
        </div>
      </form>
    </dialog>
  )
}

type DetailProps = {
  reservation: Reservation
  rooms: Room[]
  selfId: number | null
  pos: Pos
  today: string
  nowMinutes: number
  onClose: () => void
}

/** 予約の内容の小窓（見るだけ。変更・キャンセルは、あとの縦切りで足す）。 */
export function DetailPopup({ reservation: r, rooms, selfId, pos, today, nowMinutes, onClose }: DetailProps) {
  const box = useRef<HTMLDialogElement>(null)
  // 予約の枠・カードを押したときは、その押した操作（開く・同じ予約なら閉じる）に任せる
  useDismiss(true, box, onClose, false, '.rcard, td[data-id]')

  const date = dateOf(r.startAt)
  const start = minutesOf(r.startAt)
  const note =
    r.employeeId !== selfId
      ? '他の人の予約は変更できません。'
      : isStarted(date, start, today, nowMinutes)
        ? '始まった予約は変更・キャンセルできません。'
        : null

  return (
    <dialog open ref={box} className="pop" aria-label="予約の内容" style={{ left: pos.left, top: pos.top }}>
      <div className="pop-head">
        <strong>予約の内容</strong>
        <button type="button" className="x" aria-label="閉じる" onClick={onClose}>
          ×
        </button>
      </div>
      <p className="detail">
        <span className="big">
          {formatMinutes(start)}〜{formatMinutes(minutesOf(r.endAt))}
        </span>
        <br />
        {rooms.find((room) => room.id === r.roomId)?.name} ／ {formatDateLabel(date)}
        <br />
        用件：{r.purpose ?? '（用件なし）'}
        <br />
        予約した人：{r.employeeName}
      </p>
      {note && <div className="note">{note}</div>}
    </dialog>
  )
}
