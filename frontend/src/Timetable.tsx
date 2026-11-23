import { useEffect, useRef, useState } from 'react'
import type { Reservation, Room } from './api'
import { CLOSE, OPEN, UNIT, earliestStart, formatMinutes, minutesOf } from './time'

type Props = {
  rooms: Room[]
  reservations: Reservation[]
  /** 表示している日（"2026-11-20"） */
  date: string
  /** 日本時間の今日と、今の時刻（0 時からの分）。過去の枠・現在時刻の線に使う */
  today: string
  nowMinutes: number
  /** 選んでいる社員。この人の予約は青で表示する */
  selfId: number | null
  /** 下の一覧のカードに重ねている予約（表の枠を強調する） */
  highlightId: number | null
  /** 一覧のカードを押してジャンプした予約（表の枠を光らせる） */
  flashId: number | null
  /** 表の予約枠にカーソルを重ねた・外したとき（下の一覧のカードを強調するため） */
  onHover: (id: number | null) => void
  /** 小窓で入力中の予約（点線の枠で仮表示する）。見ている日のものだけ渡す */
  draft: { roomId: number; start: number; end: number } | null
  /** 空き枠を押して、そのまま離したとき（最大 1 時間で小窓を開く） */
  onFreeClick: (roomId: number, start: number, rect: DOMRect) => void
  /** 空き枠をドラッグして、start〜end を選んで離したとき */
  onFreeDrag: (roomId: number, start: number, end: number, rect: DOMRect) => void
  /** ドラッグが予約済みと重なったまま離したとき */
  onDragBlocked: () => void
  /** 予約済みの枠を押したとき */
  onReservationClick: (reservation: Reservation, rect: DOMRect) => void
}

type Drag = {
  roomId: number
  anchor: number
  lo: number
  hi: number
  /** 予約済みと重なっているか。重なっているときの範囲が badLo〜badHi */
  bad: boolean
  badLo: number
  badHi: number
  /** 押した枠とは別の枠の上に、一度でも動いたか（押すだけのクリックと、動かして戻したドラッグを分ける） */
  moved: boolean
}

const HOURS = Array.from({ length: (CLOSE - OPEN) / 60 }, (_, i) => OPEN + i * 60)
// 縦線は 30 分ごと（OPEN と CLOSE の端は引かない）
const LINES = Array.from({ length: (CLOSE - OPEN) / UNIT - 1 }, (_, i) => OPEN + (i + 1) * UNIT)
const percent = (minutes: number) => ((minutes - OPEN) / (CLOSE - OPEN)) * 100

/** 「会議室 × 時間」の表。予約済みの時間は、幅の分だけつながった 1 つのセルにする。 */
export default function Timetable({
  rooms,
  reservations,
  date,
  today,
  nowMinutes,
  selfId,
  highlightId,
  flashId,
  onHover,
  draft,
  onFreeClick,
  onFreeDrag,
  onDragBlocked,
  onReservationClick,
}: Props) {
  const firstStart = earliestStart(date, today, nowMinutes)
  const showNow = date === today && nowMinutes >= OPEN && nowMinutes < CLOSE

  // ドラッグ中の状態。anchor は押した枠の開始。lo〜hi は選んでいる範囲（重なったときは最後に重ならなかった範囲のまま）
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const latest = useRef({ onFreeClick, onFreeDrag, onDragBlocked })
  useEffect(() => {
    latest.current = { onFreeClick, onFreeDrag, onDragBlocked }
  })
  const update = (d: Drag | null) => {
    dragRef.current = d
    setDrag(d)
  }

  // 表の外で離しても、ドラッグを終わらせる
  useEffect(() => {
    const finish = () => {
      const d = dragRef.current
      if (d === null) return
      dragRef.current = null
      setDrag(null)
      const { onFreeClick, onFreeDrag, onDragBlocked } = latest.current
      if (d.bad) return onDragBlocked()
      // 動かして開始の枠に戻した（1 枠だけ）ときは取りやめ。30 分の予約は、押すだけでできる
      if (d.moved && d.hi - d.lo === UNIT) return
      const cell = document.querySelector(`td[data-room="${d.roomId}"][data-m="${d.lo}"]`)
      if (cell === null) return
      const rect = cell.getBoundingClientRect()
      if (d.lo === d.anchor && d.hi === d.anchor + UNIT) onFreeClick(d.roomId, d.anchor, rect)
      else onFreeDrag(d.roomId, d.lo, d.hi, rect)
    }
    document.addEventListener('mouseup', finish)
    return () => document.removeEventListener('mouseup', finish)
  }, [])

  /** ドラッグ中に、同じ会議室の枠（cm〜ce）の上に来た */
  const extend = (roomId: number, cm: number, ce: number) => {
    const d = dragRef.current
    if (d === null || d.roomId !== roomId) return
    const lo = Math.min(d.anchor, cm)
    const hi = Math.max(d.anchor + UNIT, ce)
    const bad = reservations.some(
      (r) => r.roomId === roomId && minutesOf(r.startAt) < hi && minutesOf(r.endAt) > lo,
    )
    const moved = d.moved || cm !== d.anchor || ce !== d.anchor + UNIT
    const next = bad ? { ...d, bad, badLo: lo, badHi: hi, moved } : { ...d, lo, hi, bad: false, moved }
    if (
      next.lo === d.lo &&
      next.hi === d.hi &&
      next.bad === d.bad &&
      next.badLo === d.badLo &&
      next.badHi === d.badHi &&
      next.moved === d.moved
    ) {
      return
    }
    update(next)
  }

  /**
   * ドラッグ中にカーソルが動いたとき、いま乗っている枠で範囲を決める。
   * 枠に入った瞬間（mouseenter）だけに頼ると、速く動かしたときに取りこぼすので、動くたびに調べる。
   */
  const onMove = (e: React.MouseEvent) => {
    const d = dragRef.current
    if (d === null) return
    const td = (e.target as HTMLElement).closest('td')
    if (td === null) return
    if (td.dataset.from !== undefined && Number(td.dataset.room) === d.roomId) {
      extend(d.roomId, Number(td.dataset.from), Number(td.dataset.to))
      return
    }
    // 上下の別の会議室の行にずれたときは、横の位置だけを見て、開始の会議室の同じ位置の枠で範囲を決める
    const x = e.clientX
    for (const cell of document.querySelectorAll<HTMLElement>(`td[data-room="${d.roomId}"][data-from]`)) {
      const rect = cell.getBoundingClientRect()
      if (x >= rect.left && x < rect.right) {
        extend(d.roomId, Number(cell.dataset.from), Number(cell.dataset.to))
        return
      }
    }
  }

  return (
    <div className="gridwrap">
      <div className="gridinner" onMouseMove={onMove}>
        <table className="timetable">
          <thead>
            <tr>
              <th className="room">会議室</th>
              {HOURS.map((h) => (
                <th key={h} className="hour" colSpan={60 / UNIT}>
                  <div>
                    <span>{formatMinutes(h)}</span>
                    {h + 60 === CLOSE && <span>{formatMinutes(CLOSE)}</span>}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rooms.map((room, index) => (
              <tr key={room.id} className={index % 2 === 1 ? 'alt' : undefined}>
                <th className="room" scope="row">
                  {room.name}（{room.capacity}名）
                </th>
                {cellsOf(room.id)}
              </tr>
            ))}
          </tbody>
        </table>
        {/* 時刻の縦線（1 時間ごとは太く、30 分ごとは細く）と、現在時刻の線 */}
        <div className="vlines" aria-hidden="true">
          {LINES.map((m) => (
            <div key={m} className={`vline ${m % 60 === 0 ? 'h' : 'm'}`} style={{ left: `${percent(m)}%` }} />
          ))}
          {showNow && <div className="nowline" data-testid="nowline" style={{ left: `${percent(nowMinutes)}%` }} />}
        </div>
      </div>
    </div>
  )

  function cellsOf(roomId: number) {
    const inRoom = reservations
      .filter((r) => r.roomId === roomId)
      .sort((a, b) => minutesOf(a.startAt) - minutesOf(b.startAt))
    const cells = []
    let cursor = OPEN
    // 入力中の予約は、同じ会議室の枠の並びに混ぜる（つながった 1 つの点線のセルにする）
    const drafted = draft !== null && draft.roomId === roomId && draft.end > draft.start ? draft : null
    const addFree = (until: number) => {
      for (; cursor < until; cursor += UNIT) {
        const start = cursor
        const past = cursor + UNIT <= firstStart
        const selected = drag !== null && drag.roomId === roomId && start >= drag.lo && start < drag.hi
        const classes = [past ? 'past' : 'free', cursor % 60 === 0 ? 'hr' : '', selected ? 'sel' : '']
          .filter(Boolean)
          .join(' ')
        cells.push(
          <td
            key={`free-${cursor}`}
            className={classes}
            title={past ? '過去の時間は予約できません' : undefined}
            aria-label={`${formatMinutes(cursor)} ${past ? '過去' : '空き'}`}
            data-testid={past ? 'past' : 'free'}
            data-room={past ? undefined : roomId}
            data-m={past ? undefined : start}
            onMouseDown={
              past
                ? undefined
                : (e) => {
                    if (e.button !== 0) return
                    e.preventDefault()
                    update({ roomId, anchor: start, lo: start, hi: start + UNIT, bad: false, badLo: 0, badHi: 0, moved: false })
                  }
            }
            data-from={past ? undefined : start}
            data-to={past ? undefined : start + UNIT}
          />,
        )
      }
    }
    const addDraft = (limit: number) => {
      if (drafted === null) return
      const start = Math.max(drafted.start, cursor)
      // 次の予約の手前で切る（既存の予約の枠を隠さない）
      const end = Math.min(drafted.end, limit, CLOSE)
      if (end <= start) return
      addFree(start)
      cells.push(
        <td key="draft" className="draft" colSpan={(end - start) / UNIT} data-testid="draft">
          {formatMinutes(start)}〜{formatMinutes(end)} 予約中…
        </td>,
      )
      cursor = end
    }
    let draftDone = drafted === null
    for (const r of inRoom) {
      if (!draftDone && drafted !== null && drafted.start < minutesOf(r.startAt)) {
        addDraft(minutesOf(r.startAt))
        draftDone = true
      }
      const start = Math.max(minutesOf(r.startAt), cursor)
      const end = Math.min(minutesOf(r.endAt), CLOSE)
      if (end <= start) continue
      addFree(start)
      const purpose = r.purpose ?? '（用件なし）'
      const classes = [
        r.employeeId === selfId ? 'mine' : 'busy',
        r.id === highlightId ? 'hl' : '',
        r.id === flashId ? 'flash' : '',
        drag !== null && drag.bad && drag.roomId === roomId && start < drag.badHi && end > drag.badLo ? 'bad' : '',
      ]
        .filter(Boolean)
        .join(' ')
      cells.push(
        <td
          key={`rsv-${r.id}`}
          className={classes}
          colSpan={(end - start) / UNIT}
          title={`${formatMinutes(start)}〜${formatMinutes(end)} ${purpose}（${r.employeeName}）`}
          data-testid="reservation"
          data-id={r.id}
          onClick={(e) => onReservationClick(r, e.currentTarget.getBoundingClientRect())}
          data-room={roomId}
          data-from={start}
          data-to={end}
          onMouseEnter={() => onHover(r.id)}
          onMouseLeave={() => onHover(null)}
        >
          {purpose}（{r.employeeName.replace('架空', '')}）
        </td>,
      )
      cursor = end
    }
    if (!draftDone) addDraft(CLOSE)
    addFree(CLOSE)
    return cells
  }
}
