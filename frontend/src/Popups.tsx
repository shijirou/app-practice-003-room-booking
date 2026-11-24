import { useEffect, useRef, useState, type FormEvent } from 'react'
import { errorMessage } from './useLoaded'
import type { Reservation, Room } from './api'
import { CLOSE, OPEN, UNIT, dateOf, formatDateLabel, formatMinutes, isStarted, minutesOf } from './time'
import type { Pos } from './placePopup'
import TimeSelect from './TimeSelect'
import type { ConfirmRequest } from './ConfirmDialog'
import { useDismiss } from './useDismiss'
import { selfOverlaps, validateForm, type Form } from './validate'

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
  /** 予約の変更か（見出し・ボタンの文が変わる） */
  editing: boolean
  /** 操作している社員と、変更中の予約の番号（自分の別の予約との重なりの警告用） */
  selfId: number | null
  editId?: number
  /** 確認ダイアログを出して、答え（true: 実行）を待つ */
  ask: (request: ConfirmRequest) => Promise<boolean>
  onChange: (form: Form) => void
  onClose: () => void
  /** 予約を作る。失敗したら例外を投げる（メッセージを小窓に出す） */
  onSubmit: (form: Form) => Promise<void>
  /** 開いたとき、最初の入力欄（会議室）にキーボードの位置を移す（［＋ 予約する］ボタンから開いたとき） */
  focusFirst?: boolean
  /** 時間のリストで、カーソルを合わせている（決定前の）時刻。表の青枠を連動させる。null は元に戻す */
  onPreview?: (field: 'start' | 'end', value: number | null) => void
}

/** 予約する小窓。入力のたびに、表へ仮表示が出る（form は親が持つ）。 */
export function ReservePopup({ form, rooms, pos, today, nowMinutes, existing, editing, selfId, editId, ask, focusFirst, onPreview, onChange, onClose, onSubmit }: ReserveProps) {
  const box = useRef<HTMLDialogElement>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // 変更中は、閉じるために外側を押しても、その操作を下の表やボタンに通さない（押した枠を選んでしまわない）
  useDismiss(true, box, onClose, editing, '.confirm')
  useEffect(() => {
    if (focusFirst) box.current?.querySelector<HTMLElement>('#p_room')?.focus()
  }, [focusFirst])

  // 時刻を選ぶと送れなくなる（4 時間を超える・過去・重なりなど）かを、送るときと同じ検査で調べる。リストで赤く表示する
  const invalidWith = (next: Form) => validateForm(next, { today, nowMinutes, existing }) !== null
  // 自分の別の会議室の予約と重なっているか（禁止ではなく警告と確認）
  const overlaps = selfOverlaps(form, existing, selfId, editId)
  const overlapOf = (r: Reservation) =>
    `${rooms.find((room) => room.id === r.roomId)?.name ?? ''} ${formatMinutes(minutesOf(r.startAt))}〜${formatMinutes(minutesOf(r.endAt))}${r.purpose ? `「${r.purpose}」` : ''}`
  const startMoved = (start: number): Form => ({ ...form, start, end: form.end > start ? form.end : Math.min(start + 60, CLOSE) })

  const setStart = (start: number) => {
    const end = form.end > start ? form.end : Math.min(start + 60, CLOSE)
    onChange({ ...form, start, end })
  }

  /** 送る前の確認の内容。重なりがあれば重なりの確認、なければ変更の確認 */
  const confirmRequest = (): ConfirmRequest => {
    if (overlaps.length > 0) {
      return {
        title: '自分の別の予約と時間が重なっています',
        lines: overlaps.map(overlapOf),
        note: editing ? '重ねて変更しますか？' : '重ねて予約しますか？',
        confirmLabel: editing ? '重ねて変更する' : '重ねて予約する',
      }
    }
    const roomName = rooms.find((room) => room.id === form.roomId)?.name ?? ''
    const purpose = form.purpose.trim()
    return {
      title: 'この内容で予約を変更しますか？',
      lines: [
        `${formatDateLabel(form.date)} ${formatMinutes(form.start)}〜${formatMinutes(form.end)}`,
        `${roomName}${purpose ? `「${purpose}」` : ''}`,
      ],
      confirmLabel: '変更する',
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    const message = validateForm(form, { today, nowMinutes, existing })
    setError(message ?? '')
    if (message) return
    // 変更は、保存する前に確認する（入力の検査を通ったあと。「戻る」なら小窓はそのまま）。
    // 自分の別の予約と重なっているときは、作る場合も確認する（禁止ではない）
    if (editing || overlaps.length > 0) {
      setBusy(true) // 確認の答えを待つ間に、続けて押して 2 回送らない
      const ok = await ask(confirmRequest())
      if (!ok) {
        setBusy(false)
        return
      }
    }
    setBusy(true)
    try {
      await onSubmit(form)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <dialog open ref={box} className="pop" aria-label={editing ? '予約の変更' : '予約'} style={{ left: pos.left, top: pos.top }}>
      <form onSubmit={submit}>
        <div className="pop-head">
          <strong>{editing ? '予約を変更する' : '予約する'}</strong>
          <button type="button" className="x" aria-label="閉じる" onClick={onClose}>
            ×
          </button>
        </div>
        {error && (
          <div className="err" role="alert">
            {error}
          </div>
        )}
        {overlaps.length > 0 && (
          <output className="warn">
            <strong>この時間は、自分の別の予約と重なっています</strong>
            {overlaps.map((r) => (
              <span key={r.id}>{overlapOf(r)}</span>
            ))}
          </output>
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
            <TimeSelect
              label="開始"
              value={form.start}
              times={options(OPEN, CLOSE - UNIT)}
              isInvalid={(m) => invalidWith(startMoved(m))}
              onChange={setStart}
              onPreview={(v) => onPreview?.('start', v)}
            />
            <span>〜</span>
            <TimeSelect
              label="終了"
              value={form.end}
              times={options(form.start + UNIT, CLOSE)}
              isInvalid={(m) => invalidWith({ ...form, end: m })}
              onChange={(end) => onChange({ ...form, end })}
              onPreview={(v) => onPreview?.('end', v)}
            />
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
            {editing ? '変更を保存' : '予約する'}
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
  /** ［変更する］を押した（自分の、始まる前の予約だけに出る） */
  onEdit: () => void
  /** ［キャンセルする］を押した（同じく、自分の、始まる前の予約だけ） */
  onCancel: () => void
  /** 開いたとき、主なボタン（なければ最初のボタン・「×」）にキーボードの位置を移す（表からキーボードで開いたとき） */
  focusFirst?: boolean
  onClose: () => void
}

/** 予約の内容の小窓（自分の、始まる前の予約は、変更・キャンセルできる）。 */
export function DetailPopup({ reservation: r, rooms, selfId, pos, today, nowMinutes, onEdit, onCancel, focusFirst, onClose }: DetailProps) {
  const box = useRef<HTMLDialogElement>(null)
  // 予約の枠・カードを押したときは、その押した操作（開く・同じ予約なら閉じる）に任せる
  useDismiss(true, box, onClose, false, '.rcard, td[data-id], .confirm')
  useEffect(() => {
    if (!focusFirst || !box.current) return
    // 主なボタン（変更する）。なければ最初のボタン、それもなければ「×」
    const target =
      box.current.querySelector<HTMLElement>('.pbtns .primary') ??
      box.current.querySelector<HTMLElement>('.pbtns button') ??
      box.current.querySelector<HTMLElement>('.x')
    target?.focus()
  }, [focusFirst])

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
      {!note && (
        <div className="pbtns">
          <button type="button" className="danger" onClick={onCancel}>
            予約をキャンセルする
          </button>
          <button type="button" className="primary" onClick={onEdit}>
            変更する
          </button>
        </div>
      )}
    </dialog>
  )
}
