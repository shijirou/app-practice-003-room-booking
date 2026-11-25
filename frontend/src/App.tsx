import { useEffect, useRef, useState } from 'react'
import {
  ApiError,
  cancelReservation,
  createReservation,
  updateReservation,
  fetchEmployees,
  fetchReservations,
  fetchRooms,
  fetchUpcoming,
  type Reservation,
} from './api'
import { useConfirm } from './useConfirm'
import DateBar from './DateBar'
import Legend from './Legend'
import Lists from './Lists'
import { placePopup, type Pos } from './placePopup'
import { DetailPopup, ReservePopup } from './Popups'
import Timetable from './Timetable'
import { CLOSE, dateOf, earliestStart, formatMinutes, formatShortDate, isoOf, minutesInTokyo, minutesOf, todayInTokyo } from './time'
import { errorMessage, useLoaded } from './useLoaded'
import { defaultEnd, firstFreeSlot, validateForm, type Form } from './validate'

type Props = {
  /** 今の日時を返す関数。テストで時刻を固定するために差し替えられる */
  now?: () => Date
}

/** 開いている小窓。form は予約する・変更する小窓（editId があれば変更）、view は予約の内容 */
type Popup = { kind: 'form'; form: Form; pos: Pos; editId?: number; focusFirst?: boolean } | { kind: 'view'; reservation: Reservation; pos: Pos; focusFirst?: boolean }

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
/** 光らせる予約が表に出ないまま、光らせる対象を覚えておく上限（読み込みの失敗などで、あとから突然光らないように） */
const FLASH_GIVE_UP_MS = 15000
const TOAST_MS = 2500

/** お知らせの見た目。赤くなったマスの位置（near）があれば、そのマスの上（上が狭ければ下）に出す。左右は画面の中に収める */
function toastProps(toast: { near?: DOMRect }): { className: string; style?: React.CSSProperties } {
  const near = toast.near
  if (near === undefined) return { className: 'toast' }
  const left = Math.min(Math.max(near.left + near.width / 2, 150), window.innerWidth - 150)
  const below = near.top < 60
  return {
    className: below ? 'toast near below' : 'toast near',
    style: { left, top: below ? near.bottom + 8 : near.top - 8 },
  }
}
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
  // near: 赤くなったマスの位置。あれば、画面の下ではなくその近くにお知らせを出す
  const [toast, setToast] = useState<{ message: string; near?: DOMRect } | null>(null)
  // 時間のリストでカーソルを合わせている（決定前の）時刻。表の点線の青枠に、仮に反映する
  const [preview, setPreview] = useState<{ field: 'start' | 'end'; value: number } | null>(null)
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

  // 光る時間（FLASH_MS）は、その予約の枠が表に出てから数える。通信が遅いと、表に出る前に終わってしまうため。
  // 出ないままのときのために、上限（FLASH_GIVE_UP_MS）だけ置いておく
  const flash = (id: number) => {
    setFlashId(id)
    if (flashTimer.current !== null) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlashId(null), FLASH_GIVE_UP_MS)
  }
  const flashShown = reservations.status === 'ok' && reservations.data.some((r) => r.id === flashId)
  useEffect(() => {
    if (!flashShown) return
    if (flashTimer.current !== null) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlashId(null), FLASH_MS)
  }, [flashShown, flashId])

  const showToast = (message: string, near?: DOMRect) => {
    setToast({ message, near })
    if (toastTimer.current !== null) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS)
  }

  // キーボードで小窓を開いたとき、開く前にキーボードの位置があった要素（マス・［＋ 予約する］ボタン）。閉じたら、そこへ戻す
  // 表のマスは、小窓が開くと点線の枠に置き換わり、元の要素が無くなるので、マスは「会議室と時刻」で探し直す
  const returnFocus = useRef<{ el: HTMLElement; cell: string | null } | null>(null)
  const rememberFocus = (byKeyboard: boolean) => {
    const el = document.activeElement
    if (!byKeyboard || !(el instanceof HTMLElement)) {
      returnFocus.current = null
      return
    }
    const { room, from } = el.dataset
    returnFocus.current = { el, cell: room && from ? `td[data-room="${room}"][data-from="${from}"]` : null }
  }
  useEffect(() => {
    if (popup !== null || returnFocus.current === null) return
    const { el, cell } = returnFocus.current
    returnFocus.current = null
    // マウスで別の場所を押して閉じたときは、そこからキーボードの位置を奪わない（位置が失われているときだけ戻す）
    if (document.activeElement !== null && document.activeElement !== document.body) return
    const target = (cell !== null ? document.querySelector<HTMLElement>(cell) : null) ?? (el.isConnected ? el : null)
    target?.focus()
  }, [popup])

  const jump = (r: Reservation) => {
    setPopup(null)
    setDate(dateOf(r.startAt))
    setHighlightId(null)
    flash(r.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /** 空き枠を押した。その開始から、30 分（1 枠）で小窓を開く */
  const openNew = (roomId: number, start: number, rect: DOMRect, byKeyboard = false) => {
    const form: Form = { roomId, date, start, end: defaultEnd(start), purpose: '' }
    rememberFocus(byKeyboard)
    setPopup({ kind: 'form', form, pos: placePopup(rect, RESERVE_HEIGHT), focusFirst: byKeyboard })
  }

  /** ［＋ 予約する］ボタンを押した（キーボードだけで予約を始める入口）。見ている日の、最初の空き 30 分で小窓を開く */
  const openFromButton = (rect: DOMRect) => {
    if (base.status !== 'ok') return
    const slot = firstFreeSlot(base.data.rooms, reservations.status === 'ok' ? reservations.data : [], earliestStart(date, today, nowMinutes))
    if (slot === null) return
    const form: Form = { roomId: slot.roomId, date, start: slot.start, end: defaultEnd(slot.start), purpose: '' }
    rememberFocus(true)
    setPopup({ kind: 'form', form, pos: placePopup(rect, RESERVE_HEIGHT), focusFirst: true })
  }

  /** ドラッグで範囲を選んだ。その範囲で小窓を開く */
  const openDrag = (roomId: number, start: number, end: number, rect: DOMRect, byKeyboard = false) => {
    rememberFocus(byKeyboard)
    setPopup({ kind: 'form', form: { roomId, date, start, end, purpose: '' }, pos: placePopup(rect, RESERVE_HEIGHT), focusFirst: byKeyboard })
  }

  /** その予約の内容の小窓が、いま開いているか */
  const isViewing = (reservation: Reservation) => popup?.kind === 'view' && popup.reservation.id === reservation.id

  /** 予約の枠を押した。同じ予約の内容がすでに開いていれば、閉じる */
  const openView = (reservation: Reservation, rect: DOMRect, byKeyboard = false) => {
    rememberFocus(byKeyboard)
    if (isViewing(reservation)) {
      setPopup(null)
      return
    }
    setPopup({ kind: 'view', reservation, pos: placePopup(rect, DETAIL_HEIGHT), focusFirst: byKeyboard })
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

  /** 予約の内容の小窓・自分のカードの［変更］を押した。その予約の値が入った状態で、変更の小窓を開く */
  const openEdit = (r: Reservation, pos: Pos) => {
    const form: Form = {
      roomId: r.roomId,
      date: dateOf(r.startAt),
      start: minutesOf(r.startAt),
      end: minutesOf(r.endAt),
      purpose: r.purpose ?? '',
    }
    setDate(form.date)
    setHighlightId(null)
    setPopup({ kind: 'form', form, pos, editId: r.id })
  }

  /** 自分のカードの［変更］。表の同じ予約の枠の近くに小窓を出す（その日の表が出る前は、カードの近く） */
  const editFromCard = (r: Reservation, card: HTMLElement) => {
    window.scrollTo(0, 0)
    const cell = dateOf(r.startAt) === date ? document.querySelector(`td[data-id="${r.id}"]`) : null
    openEdit(r, placePopup((cell ?? card).getBoundingClientRect(), RESERVE_HEIGHT))
  }

  // キャンセルの通信中は、ほかのキャンセルを受け付けない（続けて押して 2 回送らない）
  const cancelling = useRef(false)
  // 確認ダイアログ（キャンセル・変更・自分の別の予約との重なり）
  const { ask, dialog: confirmDialog } = useConfirm()

  /**
   * ［キャンセル］［キャンセルする］を押した。確認で OK のときだけ消す。
   * 成功しても失敗しても、その予約の小窓は閉じて（古い内容で操作させない）、表を読み直す。失敗の理由はお知らせに出す。
   */
  const cancel = async (r: Reservation) => {
    if (selfId === null || cancelling.current) return
    const roomName = base.status === 'ok' ? (base.data.rooms.find((room) => room.id === r.roomId)?.name ?? '') : ''
    const ok = await ask({
      title: 'この予約をキャンセルしますか？',
      lines: [
        `${formatShortDate(dateOf(r.startAt))} ${formatMinutes(minutesOf(r.startAt))}〜${formatMinutes(minutesOf(r.endAt))}`,
        `${roomName}${r.purpose ? `「${r.purpose}」` : ''}`,
      ],
      note: 'キャンセルした予約は元に戻せません。',
      confirmLabel: '予約をキャンセルする',
      danger: true,
    })
    if (!ok || cancelling.current) return
    cancelling.current = true
    try {
      await cancelReservation(r.id, selfId)
      showToast('予約をキャンセルしました')
    } catch (err) {
      showToast(errorMessage(err))
    } finally {
      cancelling.current = false
    }
    // 別の予約の小窓（入力中の変更など）は閉じない
    setPopup((p) =>
      p !== null && (p.kind === 'view' ? p.reservation.id === r.id : p.editId === r.id) ? null : p,
    )
    setReload((n) => n + 1)
  }

  /** 小窓の入力が変わった。日付を変えたら、表もその日に切り替える */
  const changeForm = (form: Form) => {
    // 変更中に会議室を変えたら、小窓が移した先の行（点線の仮表示）を隠さないよう、その行の近くへ動かす。
    // 画面（DOM）を読む計算は、setPopup の更新関数の外で済ませる（更新関数は、中で外を読まない形にする）
    let top: number | null = null
    if (popup?.kind === 'form' && popup.editId !== undefined && form.roomId !== popup.form.roomId) {
      const row = document.querySelector(`td[data-room="${form.roomId}"]`)?.closest('tr')
      if (row) top = placePopup(row.getBoundingClientRect(), RESERVE_HEIGHT).top
    }
    setPopup((p) => (p?.kind !== 'form' ? p : top === null ? { ...p, form } : { ...p, form, pos: { ...p.pos, top } }))
    if (form.date && form.date !== date) setDate(form.date)
  }

  const create = async (form: Form) => {
    if (selfId === null) throw new ApiError('社員を選んでください')
    const purpose = form.purpose.trim()
    const editId = popup?.kind === 'form' ? popup.editId : undefined
    const input = {
      employeeId: selfId,
      roomId: form.roomId,
      startAt: isoOf(form.date, form.start),
      endAt: isoOf(form.date, form.end),
      purpose: purpose === '' ? null : purpose,
    }
    const created = editId === undefined ? await createReservation(input) : await updateReservation(editId, input)
    setPopup(null)
    setDate(form.date)
    setReload((n) => n + 1)
    flash(created.id)
    showToast(editId === undefined ? '予約しました' : '予約を変更しました')
  }

  const failure =
    base.status === 'error' ? base.message : reservations.status === 'error' ? reservations.message : null
  const firstStart = earliestStart(date, today, nowMinutes)
  const hint =
    '空き枠を押して予約（ドラッグで長い時間も）。8:00〜20:00・30 分刻み。キーボードは、表の中で矢印キー・Enter。' +
    (date !== today
      ? ''
      : firstStart >= CLOSE
        ? ' 本日の受付は終了しました。'
        : ` 今日は ${formatMinutes(firstStart)} 以降。`)

  // 変更中は、元の予約の枠を表から隠す（点線の仮表示に置き換わる。自分の古い時間とは重ならない）
  const editId = popup?.kind === 'form' ? popup.editId : undefined
  const dayReservations =
    reservations.status === 'ok' ? reservations.data.filter((r) => r.id !== editId) : null

  // 入力中の予約。時間のリストにカーソルを合わせている間は、その時刻を仮に反映する（開始が終了以後になるときは、小窓と同じく 1 時間後）
  const draft = (() => {
    if (popup?.kind !== 'form' || popup.form.date !== date) return null
    let { start, end } = popup.form
    if (preview?.field === 'start') {
      start = preview.value
      if (end <= start) end = Math.min(start + 60, CLOSE)
    } else if (preview?.field === 'end') {
      end = preview.value
    }
    // 予約できない時間（4 時間を超える・過去・重なりなど）は、青ではなく赤の枠で見せる
    const invalid = validateForm({ ...popup.form, start, end }, { today, nowMinutes, existing: dayReservations }) !== null
    return { roomId: popup.form.roomId, start, end, invalid }
  })()

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
          actions={
            <button
              type="button"
              className="primary"
              disabled={base.status !== 'ok' || firstStart >= CLOSE}
              title={firstStart >= CLOSE ? (date < today ? '過去の日は予約できません' : '本日の受付は終了しました') : '空いている 30 分で予約の小窓を開きます'}
              onClick={(e) => openFromButton(e.currentTarget.getBoundingClientRect())}
            >
              ＋ 予約する
            </button>
          }
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
              reservations={dayReservations ?? reservations.data}
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
              onDragBlocked={(reason, near) =>
                showToast(reason === 'long' ? '1 件の予約は 4 時間までです' : 'その時間はすでに予約があります', near)
              }
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
          onEdit={editFromCard}
          onCancel={(r) => void cancel(r)}
          onRetry={() => setRetry((n) => n + 1)}
        />
      )}

      {base.status === 'ok' && popup?.kind === 'form' && (
        <ReservePopup
          form={popup.form}
          rooms={base.data.rooms}
          pos={popup.pos}
          today={today}
          nowMinutes={nowMinutes}
          existing={popup.form.date === date ? dayReservations : null}
          editing={popup.editId !== undefined}
          selfId={selfId}
          editId={popup.editId}
          ask={ask}
          onChange={changeForm}
          onClose={() => setPopup(null)}
          onSubmit={create}
          focusFirst={popup.focusFirst}
          onPreview={(field, value) => setPreview(value === null ? null : { field, value })}
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
          onEdit={() => openEdit(popup.reservation, popup.pos)}
          onCancel={() => void cancel(popup.reservation)}
          focusFirst={popup.focusFirst}
          onClose={() => setPopup(null)}
        />
      )}

      {toast !== null && <output {...toastProps(toast)}>{toast.message}</output>}
      {confirmDialog}
    </div>
  )
}
