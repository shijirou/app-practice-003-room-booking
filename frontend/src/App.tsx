import { useEffect, useState } from 'react'
import { fetchEmployees, fetchReservations, fetchRooms, fetchUpcoming, type Reservation } from './api'
import DateBar from './DateBar'
import Legend from './Legend'
import Lists from './Lists'
import Timetable from './Timetable'
import { CLOSE, dateOf, earliestStart, formatMinutes, minutesInTokyo, todayInTokyo } from './time'
import { useLoaded } from './useLoaded'

type Props = {
  /** 今の日時を返す関数。テストで時刻を固定するために差し替えられる */
  now?: () => Date
}

/** 社員と会議室を、まとめて読み込む */
async function fetchBase() {
  const [employees, rooms] = await Promise.all([fetchEmployees(), fetchRooms()])
  return { employees, rooms }
}

/** 社員が決まる前は、空の一覧を返す */
async function fetchUpcomingOf(employeeId: number | null) {
  return employeeId === null ? [] : fetchUpcoming(employeeId)
}

const CLOCK_INTERVAL_MS = 30_000

export default function App({ now = () => new Date() }: Props) {
  // 30 秒ごとに描き直して、現在時刻と「過去」の枠を新しくする
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), CLOCK_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  const current = now()
  const today = todayInTokyo(current)
  const nowMinutes = minutesInTokyo(current)

  const [date, setDate] = useState(today)
  const [chosenId, setChosenId] = useState<number | null>(null)
  const [highlightId, setHighlightId] = useState<number | null>(null)
  const [flashId, setFlashId] = useState<number | null>(null)
  // 「もう一度読み込む」ボタンで増やして、読み込みをやり直す
  const [retry, setRetry] = useState(0)

  const base = useLoaded(fetchBase, null, retry)
  const reservations = useLoaded(fetchReservations, date, retry)
  // まだ選んでいなければ、先頭の社員
  const selfId = chosenId ?? (base.status === 'ok' ? (base.data.employees[0]?.id ?? null) : null)
  const upcoming = useLoaded(fetchUpcomingOf, selfId, retry)

  const jump = (r: Reservation) => {
    setDate(dateOf(r.startAt))
    setFlashId(r.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    setTimeout(() => setFlashId(null), 1500)
  }

  const failure =
    base.status === 'error' ? base.message : reservations.status === 'error' ? reservations.message : null
  const firstStart = earliestStart(date, today, nowMinutes)
  const hint =
    '8:00〜20:00・30 分刻み。' +
    (date !== today
      ? ''
      : firstStart >= CLOSE
        ? ' 本日の受付は終了しました。'
        : ` 今日は ${formatMinutes(firstStart)} 以降。`)

  return (
    <div className="wrap">
      <header className="top">
        <h1>会議室予約</h1>
        <label className="loginbar">
          ログイン中（仮）
          <select
            value={selfId ?? ''}
            onChange={(e) => setChosenId(Number(e.target.value))}
            disabled={base.status !== 'ok'}
          >
            {base.status === 'ok' &&
              base.data.employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
          </select>
        </label>
      </header>

      <section className="card">
        <DateBar
          date={date}
          today={today}
          nowMinutes={nowMinutes}
          onChange={(d) => {
            setDate(d)
            setHighlightId(null)
          }}
        />
        <div className="infobar">
          <p className="hint">{hint}</p>
          <Legend />
        </div>

        {failure !== null ? (
          <div className="err" role="alert">
            {failure}
            <button type="button" onClick={() => setRetry((n) => n + 1)}>
              もう一度読み込む
            </button>
          </div>
        ) : base.status === 'loading' || reservations.status === 'loading' ? (
          <p className="empty">読み込み中…</p>
        ) : (
          base.status === 'ok' &&
          reservations.status === 'ok' && (
            <Timetable
              rooms={base.data.rooms}
              reservations={reservations.data}
              date={date}
              today={today}
              nowMinutes={nowMinutes}
              selfId={selfId}
              highlightId={highlightId}
              flashId={flashId}
              onHover={setHighlightId}
            />
          )
        )}
      </section>

      {base.status === 'ok' && reservations.status === 'ok' && (
        <Lists
          rooms={base.data.rooms}
          selfId={selfId}
          selfName={base.data.employees.find((e) => e.id === selfId)?.name ?? ''}
          date={date}
          dayReservations={reservations.data}
          upcoming={upcoming}
          today={today}
          nowMinutes={nowMinutes}
          highlightId={highlightId}
          onHover={setHighlightId}
          onJump={jump}
        />
      )}
    </div>
  )
}
