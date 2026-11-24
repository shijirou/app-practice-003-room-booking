/* oxlint-disable jsx-a11y/no-redundant-roles -- grid の中の td は、ブラウザでは自動で gridcell になるが、テスト環境（jsdom）は認識しないので、役割を明示している */
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
  draft: { roomId: number; start: number; end: number; invalid?: boolean } | null
  /** 空き枠を押して、そのまま離したとき（30 分で小窓を開く）。byKeyboard はキーボードの Enter・Space のとき */
  onFreeClick: (roomId: number, start: number, rect: DOMRect, byKeyboard?: boolean) => void
  /** 空き枠をドラッグ（または Shift + ← →）して、start〜end を選んで離した（Enter を押した）とき */
  onFreeDrag: (roomId: number, start: number, end: number, rect: DOMRect, byKeyboard?: boolean) => void
  /** ドラッグが予約済みと重なったまま離したとき */
  onDragBlocked: () => void
  /** 予約済みの枠を押したとき */
  onReservationClick: (reservation: Reservation, rect: DOMRect, byKeyboard?: boolean) => void
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
  /** キーボード（Shift + ← →）で選んでいる範囲か。マウスのボタンを離したときの終了処理の対象にしない */
  keyboard?: boolean
  /** キーボードで選んでいる範囲の、動かしている側の端の枠の開始 */
  cur?: number
}

/** 矢印キーで動けるマス（空き枠か予約済みの枠）。id は予約済みの枠のときだけ */
type Nav = { from: number; to: number; id: number | null }

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
  // 矢印キーで今いるマス（表の中で Tab が止まる 1 か所は、ここで決まる）
  const [active, setActive] = useState<{ roomId: number; from: number } | null>(null)

  // 表の外で離しても、ドラッグを終わらせる
  useEffect(() => {
    const finish = () => {
      const d = dragRef.current
      if (d === null || d.keyboard) return
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
    if (d === null || d.keyboard) return
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

  // 矢印キーで動けるマスの一覧（会議室ごと）と、表の中で Tab が止まる 1 か所
  const navs = new Map(rooms.map((room) => [room.id, navOf(room.id)]))
  let tabKey: string | null = null
  const current = active && navs.get(active.roomId)?.find((c) => c.from <= active.from && active.from < c.to)
  if (active && current) tabKey = `${active.roomId}:${current.from}`
  for (const room of rooms) {
    if (tabKey !== null) break
    const first = navs.get(room.id)?.[0]
    if (first) tabKey = `${room.id}:${first.from}`
  }

  const focusCell = (roomId: number, from: number) => {
    document.querySelector<HTMLElement>(`td[data-room="${roomId}"][data-from="${from}"]`)?.focus()
  }
  const clearKeyboardSelection = () => {
    if (dragRef.current?.keyboard) update(null)
  }

  /** Shift + ← → で、空き枠の範囲を 1 枠ずつ広げ縮める（ドラッグと同じ表示。重なると赤） */
  const selectBy = (roomId: number, cell: Nav, dir: 1 | -1) => {
    if (dragRef.current?.keyboard !== true) {
      if (cell.id !== null) return // 予約済みの枠からは選び始めない
      update({ roomId, anchor: cell.from, lo: cell.from, hi: cell.to, bad: false, badLo: 0, badHi: 0, moved: false, keyboard: true, cur: cell.from })
    }
    const next = (dragRef.current?.cur ?? cell.from) + dir * UNIT
    if (next < Math.max(OPEN, firstStart) || next + UNIT > CLOSE) return
    extend(roomId, next, next + UNIT)
    if (dragRef.current) update({ ...dragRef.current, cur: next })
  }

  /** マスからキーボードの位置が出たとき。表の外に出たら、キーボードで選んでいた範囲はやめる */
  const onCellBlur = (e: React.FocusEvent) => {
    if (!(e.relatedTarget instanceof Element) || !e.relatedTarget.closest('.timetable')) clearKeyboardSelection()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const td = (e.target as HTMLElement).closest('td')
    if (td === null || td.dataset.from === undefined || td.dataset.room === undefined) return
    const roomId = Number(td.dataset.room)
    const list = navs.get(roomId) ?? []
    const index = list.findIndex((c) => c.from === Number(td.dataset.from))
    if (index < 0) return
    const move = (rid: number, cell: Nav | undefined) => {
      e.preventDefault()
      if (!cell) return
      clearKeyboardSelection()
      setActive({ roomId: rid, from: cell.from })
      focusCell(rid, cell.from)
    }
    const k = e.key
    if (e.shiftKey && (k === 'ArrowLeft' || k === 'ArrowRight')) {
      e.preventDefault()
      selectBy(roomId, list[index], k === 'ArrowRight' ? 1 : -1)
    } else if (k === 'ArrowLeft') move(roomId, list[index - 1])
    else if (k === 'ArrowRight') move(roomId, list[index + 1])
    else if (k === 'Home') move(roomId, list[0])
    else if (k === 'End') move(roomId, list[list.length - 1])
    else if (k === 'ArrowUp' || k === 'ArrowDown') {
      const other = rooms[rooms.findIndex((r) => r.id === roomId) + (k === 'ArrowDown' ? 1 : -1)]
      const cells = other ? (navs.get(other.id) ?? []) : []
      const from = list[index].from
      // 同じ時刻のマス。そこが過去などで動けないときは、いちばん近いマス
      const target =
        cells.find((c) => c.from <= from && from < c.to) ??
        [...cells].sort((a, b) => Math.abs(a.from - from) - Math.abs(b.from - from))[0]
      move(other?.id ?? roomId, target)
    } else if (k === 'Enter' || k === ' ') {
      e.preventDefault()
      const d = dragRef.current
      if (d?.keyboard) {
        update(null)
        if (d.bad) return onDragBlocked()
        const rect = (document.querySelector(`td[data-room="${d.roomId}"][data-m="${d.lo}"]`) ?? td).getBoundingClientRect()
        if (d.hi - d.lo === UNIT) onFreeClick(d.roomId, d.lo, rect, true)
        else onFreeDrag(d.roomId, d.lo, d.hi, rect, true)
        return
      }
      const cell = list[index]
      const rsv = cell.id === null ? undefined : reservations.find((r) => r.id === cell.id)
      if (rsv) onReservationClick(rsv, td.getBoundingClientRect(), true)
      else onFreeClick(roomId, cell.from, td.getBoundingClientRect(), true)
    } else if (k === 'Escape' && dragRef.current?.keyboard) {
      e.preventDefault()
      update(null)
    }
  }

  return (
    <div className="gridwrap">
      <div className="gridinner" onMouseMove={onMove}>
        {/* 矢印キーで動く表は、table に grid 役割を付ける（WAI-ARIA の作法）。lint の警告は、この場合に当てはまらない */}
        {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-to-interactive-role */}
        <table className="timetable" role="grid" aria-label="会議室ごとの予約表（矢印キーで移動、Enter で予約）">
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

  /** 矢印キーで動けるマス（過去と仮表示は除く）。cellsOf と同じ並びで作る */
  function navOf(roomId: number): Nav[] {
    const list: Nav[] = []
    let cursor = OPEN
    const addFree = (until: number) => {
      for (; cursor < until; cursor += UNIT) {
        if (cursor + UNIT > firstStart) list.push({ from: cursor, to: cursor + UNIT, id: null })
      }
    }
    const inRoom = reservations
      .filter((r) => r.roomId === roomId)
      .sort((a, b) => minutesOf(a.startAt) - minutesOf(b.startAt))
    for (const r of inRoom) {
      const start = Math.max(minutesOf(r.startAt), cursor)
      const end = Math.min(minutesOf(r.endAt), CLOSE)
      if (end <= start) continue
      addFree(start)
      list.push({ from: start, to: end, id: r.id })
      cursor = end
    }
    addFree(CLOSE)
    return list
  }

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
            role="gridcell"
            key={`free-${cursor}`}
            className={classes}
            title={past ? '過去の時間は予約できません' : undefined}
            aria-label={`${formatMinutes(cursor)} ${past ? '過去' : '空き'}`}
            aria-disabled={past ? true : undefined}
            data-testid={past ? 'past' : 'free'}
            tabIndex={past ? undefined : tabKey === `${roomId}:${start}` ? 0 : -1}
            onFocus={past ? undefined : () => setActive({ roomId, from: start })}
            onBlur={past ? undefined : onCellBlur}
            onKeyDown={past ? undefined : onKeyDown}
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
        <td role="gridcell" key="draft" className={drafted.invalid ? 'draft invalid' : 'draft'} colSpan={(end - start) / UNIT} data-testid="draft">
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
          role="gridcell"
          key={`rsv-${r.id}`}
          className={classes}
          colSpan={(end - start) / UNIT}
          title={`${formatMinutes(start)}〜${formatMinutes(end)} ${purpose}（${r.employeeName}）`}
          aria-label={`${formatMinutes(start)}〜${formatMinutes(end)} ${purpose}（${r.employeeName}）${r.employeeId === selfId ? ' 自分の予約' : ''}`}
          data-testid="reservation"
          data-id={r.id}
          tabIndex={tabKey === `${roomId}:${start}` ? 0 : -1}
          onFocus={() => setActive({ roomId, from: start })}
          onBlur={onCellBlur}
          onKeyDown={onKeyDown}
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
