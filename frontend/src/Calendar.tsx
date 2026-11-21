import { useState } from 'react'
import { calendarDays, weekdayOf } from './time'

type Props = {
  /** 今見ている日 */
  date: string
  today: string
  /** 日付を押したとき（選んでも閉じない） */
  onSelect: (date: string) => void
  onClose: () => void
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

/** ミニカレンダー。日付を選んでも閉じず、×か外側のクリックで閉じる。 */
export default function Calendar({ date, today, onSelect, onClose }: Props) {
  const [year, setYear] = useState(Number(date.slice(0, 4)))
  const [month, setMonth] = useState(Number(date.slice(5, 7)))

  const moveMonth = (delta: number) => {
    const index = year * 12 + (month - 1) + delta
    setYear(Math.floor(index / 12))
    setMonth((index % 12) + 1)
  }

  return (
    <dialog open className="cal" aria-label="カレンダー">
      <div className="cal-head">
        <button type="button" aria-label="前の月" onClick={() => moveMonth(-1)}>
          ◀
        </button>
        <div className="cal-title">
          {year}年{month}月
        </div>
        <button type="button" aria-label="次の月" onClick={() => moveMonth(1)}>
          ▶
        </button>
        <span className="spacer" />
        <button
          type="button"
          onClick={() => {
            onSelect(today)
            setYear(Number(today.slice(0, 4)))
            setMonth(Number(today.slice(5, 7)))
          }}
        >
          今日
        </button>
        <button type="button" className="cal-x" aria-label="閉じる" title="閉じる" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="cal-grid">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={`dow${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}`}>
            {w}
          </div>
        ))}
        {calendarDays(year, month).map((d) => {
          const dow = weekdayOf(d)
          const cls = [
            'day',
            Number(d.slice(5, 7)) !== month ? 'out' : '',
            d === today ? 'today' : '',
            d === date ? 'sel' : '',
            dow === 0 ? 'sun' : dow === 6 ? 'sat' : '',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <button key={d} type="button" className={cls} data-date={d} onClick={() => onSelect(d)}>
              {Number(d.slice(8))}
            </button>
          )
        })}
      </div>
    </dialog>
  )
}
