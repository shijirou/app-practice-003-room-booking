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
}: Props) {
  const firstStart = earliestStart(date, today, nowMinutes)
  const showNow = date === today && nowMinutes >= OPEN && nowMinutes < CLOSE

  return (
    <div className="gridwrap">
      <div className="gridinner">
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
    const addFree = (until: number) => {
      for (; cursor < until; cursor += UNIT) {
        const past = cursor + UNIT <= firstStart
        const classes = [past ? 'past' : 'free', cursor % 60 === 0 ? 'hr' : ''].filter(Boolean).join(' ')
        cells.push(
          <td
            key={`free-${cursor}`}
            className={classes}
            title={past ? '過去の時間は予約できません' : undefined}
            aria-label={`${formatMinutes(cursor)} ${past ? '過去' : '空き'}`}
            data-testid={past ? 'past' : 'free'}
          />,
        )
      }
    }
    for (const r of inRoom) {
      const start = Math.max(minutesOf(r.startAt), cursor)
      const end = Math.min(minutesOf(r.endAt), CLOSE)
      if (end <= start) continue
      addFree(start)
      const purpose = r.purpose ?? '（用件なし）'
      const classes = [
        r.employeeId === selfId ? 'mine' : 'busy',
        r.id === highlightId ? 'hl' : '',
        r.id === flashId ? 'flash' : '',
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
          onMouseEnter={() => onHover(r.id)}
          onMouseLeave={() => onHover(null)}
        >
          {purpose}（{r.employeeName.replace('架空', '')}）
        </td>,
      )
      cursor = end
    }
    addFree(CLOSE)
    return cells
  }
}
