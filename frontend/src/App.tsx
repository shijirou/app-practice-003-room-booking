import { useEffect, useRef, useState } from 'react'
import {
  createReservation,
  fetchEmployees,
  fetchReservations,
  fetchRooms,
  fetchUpcoming,
  type Reservation,
} from './api'
import DateBar from './DateBar'
import Legend from './Legend'
import Lists from './Lists'
import { placePopup, type Pos } from './placePopup'
import { DetailPopup, ReservePopup } from './Popups'
import Timetable from './Timetable'
import { CLOSE, dateOf, earliestStart, formatMinutes, isoOf, minutesInTokyo, todayInTokyo } from './time'
import { useLoaded } from './useLoaded'
import { defaultEnd, type Form } from './validate'

type Props = {
  /** 今の日時を返す関数。テストで時刻を固定するために差し替えられる */
  now?: () => Date
}

/** 開いている小窓。new は予約する小窓、view は予約の内容（見るだけ） */
type Popup = { kind: 'new'; form: Form; pos: Pos } | { kind: 'view'; reservation: Reservation; pos: Pos }

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
const FLASH_MS = 1500
const TOAST_MS = 2500
// 小窓のおおよその高さ（下にはみ出すときは上に出すための目安）
const RESERVE_HEIGHT = 330
const DETAIL_HEIGHT = 210

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
  const [popup, setPopup] = useState<Popup | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  // 「もう一度読み込む」ボタンで増やして、読み込みをやり直す
  const [retry, setRetry] = useState(0)
  // 予約を作ったあとに、予約の一覧だけを読み直すために増やす
  const [reload, setReload] = useState(0)
  // 光らせる・お知らせを出す時間のタイマー（続けて起きたら、前のを止める）
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (flashTimer.current !== null) clearTimeout(flashTimer.current)
      if (toastTimer.current !== null) clearTimeout(toastTimer.current)
    },
    [],
  )

  const base = useLoaded(fetchBase, null, retry)
  const reservations = useLoaded(fetchReservations, date, retry + reload)
  // まだ選んでいなければ、先頭の社員
  const selfId = chosenId ?? (base.status === 'ok' ? (base.data.employees[0]?.id ?? null) : null)
  const upcoming = useLoaded(fetchUpcomingOf, selfId, retry + reload)

  const flash = (id: number) => {
    setFlashId(id)
    if (flashTimer.current !== null) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlashId(null), FLASH_MS)
  }

  const showToast = (message: string) => {
    setToast(message)
    if (toastTimer.current !== null) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS)
  }

  const jump = (r: Reservation) => {
    setPopup(null)
    setDate(dateOf(r.startAt))
    setHighlightId(null)
    flash(r.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /** 空き枠を押した。その開始から、30 分（1 枠）で小窓を開く */
  const openNew = (roomId: number, start: number, rect: DOMRect) => {
    const form: Form = { roomId, date, start, end: defaultEnd(start), purpose: '' }
    setPopup({ kind: 'new', form, pos: placePopup(rect, RESERVE_HEIGHT) })
  }

  /** ドラッグで範囲を選んだ。その範囲で小窓を開く */
  const openDrag = (roomId: number, start: number, end: number, rect: DOMRect) => {
    setPopup({ kind: 'new', form: { roomId, date, start, end, purpose: '' }, pos: placePopup(rect, RESERVE_HEIGHT) })
  }

  /** その予約の内容の小窓が、いま開いているか */
  const isViewing = (reservation: Reservation) => popup?.kind === 'view' && popup.reservation.id === reservation.id

  /** 予約の枠を押した。同じ予約の内容がすでに開いていれば、閉じる */
  const openView = (reservation: Reservation, rect: DOMRect) => {
    if (isViewing(reservation)) {
      setPopup(null)
      return
    }
    setPopup({ kind: 'view', reservation, pos: placePopup(rect, DETAIL_HEIGHT) })
  }

  /** 「みんな」のカードを押した。表の同じ予約の枠の近くに、予約の内容を出す（開いているときは閉じる） */
  const openFromCard = (reservation: Reservation, card: HTMLElement) => {
    if (isViewing(reservation)) {
      setPopup(null)
      return
    }
    window.scrollTo(0, 0)
    const cell = document.querySelector(`td[data-id="${reservation.id}"]`)
    flash(reservation.id)
    openView(reservation, (cell ?? card).getBoundingClientRect())
  }

  /** 小窓の入力が変わった。日付を変えたら、表もその日に切り替える */
  const changeForm = (form: Form) => {
    setPopup((p) => (p?.kind === 'new' ? { ...p, form } : p))
    if (form.date && form.date !== date) setDate(form.date)
  }

  const create = async (form: Form) => {
    if (selfId === null) return
    const purpose = form.purpose.trim()
    const created = await createReservation({
      employeeId: selfId,
      roomId: form.roomId,
      startAt: isoOf(form.date, form.start),
      endAt: isoOf(form.date, form.end),
      purpose: purpose === '' ? null : purpose,
    })
    setPopup(null)
    setDate(form.date)
    setReload((n) => n + 1)
    flash(created.id)
    showToast('予約しました')
  }

  const failure =
    base.status === 'error' ? base.message : reservations.status === 'error' ? reservations.message : null
  const firstStart = earliestStart(date, today, nowMinutes)
  const hint =
    '空き枠を押して予約（ドラッグで長い時間も）。8:00〜20:00・30 分刻み。' +
    (date !== today
      ? ''
      : firstStart >= CLOSE
        ? ' 本日の受付は終了しました。'
        : ` 今日は ${formatMinutes(firstStart)} 以降。`)

  const draft =
    popup?.kind === 'new' && popup.form.date === date
      ? { roomId: popup.form.roomId, start: popup.form.start, end: popup.form.end }
      : null

  return (
    <div className="wrap">
      <section className="card">
        <header className="top">
          <h1>会議室予約表</h1>
          <label className="loginbar">
            ログイン中（仮）
            <select
              value={selfId ?? ''}
              onChange={(e) => {
                setChosenId(Number(e.target.value))
                setPopup(null)
              }}
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
        <DateBar
          date={date}
          today={today}
          nowMinutes={nowMinutes}
          selfId={selfId}
          reloadKey={retry + reload}
          onChange={(d) => {
            setDate(d)
            setHighlightId(null)
            setPopup(null)
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
              draft={draft}
              onFreeClick={openNew}
              onFreeDrag={openDrag}
              onDragBlocked={() => showToast('その時間はすでに予約があります')}
              onReservationClick={openView}
            />
          )
        )}
      </section>

      {base.status === 'ok' && (
        <Lists
          rooms={base.data.rooms}
          selfId={selfId}
          selfName={base.data.employees.find((e) => e.id === selfId)?.name ?? ''}
          date={date}
          day={reservations}
          upcoming={upcoming}
          today={today}
          nowMinutes={nowMinutes}
          highlightId={highlightId}
          onHover={setHighlightId}
          onJump={jump}
          onOpen={openFromCard}
          onRetry={() => setRetry((n) => n + 1)}
        />
      )}

      {base.status === 'ok' && popup?.kind === 'new' && (
        <ReservePopup
          form={popup.form}
          rooms={base.data.rooms}
          pos={popup.pos}
          today={today}
          nowMinutes={nowMinutes}
          existing={reservations.status === 'ok' && popup.form.date === date ? reservations.data : null}
          onChange={changeForm}
          onClose={() => setPopup(null)}
          onSubmit={create}
        />
      )}
      {base.status === 'ok' && popup?.kind === 'view' && (
        <DetailPopup
          reservation={popup.reservation}
          rooms={base.data.rooms}
          selfId={selfId}
          pos={popup.pos}
          today={today}
          nowMinutes={nowMinutes}
          onClose={() => setPopup(null)}
        />
      )}

      {toast !== null && (
        <output className="toast">{toast}</output>
      )}
    </div>
  )
}
