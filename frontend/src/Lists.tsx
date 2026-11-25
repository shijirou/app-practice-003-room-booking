import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Reservation, Room } from './api'
import { dateOf, formatMinutes, formatShortDate, isFinished, isStarted, minutesOf } from './time'
import type { Loaded } from './useLoaded'

type Props = {
  rooms: Room[]
  /** 選んでいる社員 */
  selfId: number | null
  selfName: string
  /** 今見ている日と、その日の全予約 */
  date: string
  day: Loaded<Reservation[]>
  /** 選んでいる社員の、今から先の予約 */
  upcoming: Loaded<Reservation[]>
  today: string
  nowMinutes: number
  /** 表の枠にカーソルを重ねている予約（カードを強調する） */
  highlightId: number | null
  onHover: (id: number | null) => void
  /** 「自分の予約」のカードを押したとき（その日へジャンプ） */
  onJump: (reservation: Reservation) => void
  /** 「みんな」のカードを押したとき（予約の内容を開く） */
  onOpen: (reservation: Reservation, card: HTMLElement) => void
  /** 「自分の予約」のカードの［変更］を押したとき */
  onEdit: (reservation: Reservation, card: HTMLElement) => void
  /** 「自分の予約」のカードの［キャンセル］を押したとき */
  onCancel: (reservation: Reservation) => void
  /** 読み込みに失敗したとき、やり直す */
  onRetry: () => void
}

type Tab = 'mine' | 'day'

const TABS: Tab[] = ['mine', 'day']

/** 下の欄。「自分の予約（今後）」と「その日のみんなの予約」をタブで切り替える。 */
export default function Lists(props: Props) {
  const { rooms, selfName, date, upcoming, today, nowMinutes } = props
  const [tab, setTab] = useState<Tab>('mine')

  // タブの切り替え（WAI-ARIA のタブの作法）: ← → で隣へ、Home・End で端へ。選んだタブにキーボードの位置も移す
  const onTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = TABS.indexOf(tab)
    const next =
      e.key === 'ArrowRight' ? TABS[(i + 1) % TABS.length] : e.key === 'ArrowLeft' ? TABS[(i + TABS.length - 1) % TABS.length] : e.key === 'Home' ? TABS[0] : e.key === 'End' ? TABS[TABS.length - 1] : null
    if (next === null) return
    e.preventDefault()
    setTab(next)
    document.getElementById(`tab-${next}`)?.focus()
  }

  const roomName = (id: number) => rooms.find((r) => r.id === id)?.name ?? ''
  const purposeOf = (r: Reservation) => r.purpose ?? '（用件なし）'
  const done = (r: Reservation) => isFinished(dateOf(r.startAt), minutesOf(r.endAt), today, nowMinutes)

  // 画面を開いたまま時間が過ぎて終わった予約は、「今後」から外す
  const mine = upcoming.status === 'ok' ? upcoming.data.filter((r) => !done(r)) : []
  const dayList = [...(props.day.status === 'ok' ? props.day.data : [])].sort(
    (a, b) => minutesOf(a.startAt) - minutesOf(b.startAt) || a.roomId - b.roomId,
  )

  // 表の枠にカーソルを重ねたとき、強調されるカードが一覧の見える範囲の外なら、一覧だけを動かして見えるようにする。
  // 見えているカードでは動かさない（カードにカーソルを重ねたときに、一覧が揺れない）。ページ全体は動かさない
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const list = listRef.current
    const card = list?.querySelector('.rcard.hl')
    if (!list || !card) return
    const box = list.getBoundingClientRect()
    const rect = card.getBoundingClientRect()
    if (rect.top < box.top) list.scrollTop -= box.top - rect.top
    else if (rect.bottom > box.bottom) list.scrollTop += rect.bottom - box.bottom
  }, [props.highlightId])

  return (
    <section className="card lists">
      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          id="tab-mine"
          aria-selected={tab === 'mine'}
          aria-controls="lists-panel"
          tabIndex={tab === 'mine' ? 0 : -1}
          onKeyDown={onTabKeyDown}
          className={`tab${tab === 'mine' ? ' on' : ''}`}
          onClick={() => setTab('mine')}
        >
          自分（{selfName}）の予約{upcoming.status === 'ok' ? `${mine.length}件` : ''}
        </button>
        <button
          type="button"
          role="tab"
          id="tab-day"
          aria-selected={tab === 'day'}
          aria-controls="lists-panel"
          tabIndex={tab === 'day' ? 0 : -1}
          onKeyDown={onTabKeyDown}
          className={`tab all${tab === 'day' ? ' on' : ''}`}
          onClick={() => setTab('day')}
        >
          {formatShortDate(date)} の予約（みんな）{props.day.status === 'ok' ? `${dayList.length}件` : ''}
        </button>
      </div>

      {tab === 'mine' && (
        <div className="list" ref={listRef} role="tabpanel" id="lists-panel" aria-labelledby="tab-mine">
          {upcoming.status === 'loading' && <div className="empty">読み込み中…</div>}
          {upcoming.status === 'error' && (
            <div className="err" role="alert">
              {upcoming.message}
              <button type="button" onClick={props.onRetry}>
                もう一度読み込む
              </button>
            </div>
          )}
          {upcoming.status === 'ok' && mine.length === 0 && (
            <div className="empty">
              予約はまだありません。
              <br />
              上の表の空き枠を押して予約できます。
            </div>
          )}
          {mine.map((r) => {
            const started = isStarted(dateOf(r.startAt), minutesOf(r.startAt), today, nowMinutes)
            return (
              // カードの中に［変更］ボタンを置くので、カード全体は div。ジャンプは、カードのほぼ全体に広がるボタンで受ける
              <div
                key={r.id}
                className={`rcard mine jump${dateOf(r.startAt) === date ? ' here' : ''}${props.highlightId === r.id ? ' hl' : ''}`}
                title={`押すと ${formatShortDate(dateOf(r.startAt))} にジャンプします`}
                onMouseEnter={() => props.onHover(r.id)}
                onMouseLeave={() => props.onHover(null)}
              >
                <button type="button" className="rmain" onClick={() => props.onJump(r)}>
                  <span className="rtime">
                    {dateOf(r.startAt) === today && (
                      <>
                        <span className="todaydot" aria-hidden="true" data-testid="todaydot">
                          ●
                        </span>
                        <span className="sr-only">今日 </span>
                      </>
                    )}
                    {formatShortDate(dateOf(r.startAt))} {formatMinutes(minutesOf(r.startAt))}〜
                    {formatMinutes(minutesOf(r.endAt))}
                  </span>
                  <span className="rsub">
                    {roomName(r.roomId)} ／ {purposeOf(r)}
                  </span>
                </button>
                {started ? (
                  <span className="rsub fixed">進行中</span>
                ) : (
                  <div className="btns">
                    <button type="button" onClick={(e) => props.onEdit(r, e.currentTarget.closest('.rcard') as HTMLElement)}>
                      変更
                    </button>
                    <button type="button" className="danger" onClick={() => props.onCancel(r)}>
                      予約をキャンセル
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {tab === 'day' && (
        <div className="list" ref={listRef} role="tabpanel" id="lists-panel" aria-labelledby="tab-day">
          {props.day.status === 'loading' && <div className="empty">読み込み中…</div>}
          {props.day.status === 'error' && <div className="empty">{props.day.message}</div>}
          {props.day.status === 'ok' && dayList.length === 0 && (
            <div className="empty">この日の予約はまだありません</div>
          )}
          {dayList.map((r) => (
            <button
              type="button"
              key={r.id}
              className={`rcard ${r.employeeId === props.selfId ? 'mine' : 'other'}${done(r) ? ' done' : ''}${props.highlightId === r.id ? ' hl' : ''}`}
              onClick={(e) => props.onOpen(r, e.currentTarget)}
              onMouseEnter={() => props.onHover(r.id)}
              onMouseLeave={() => props.onHover(null)}
            >
              <span className="rtime">
                {formatMinutes(minutesOf(r.startAt))}〜{formatMinutes(minutesOf(r.endAt))}
              </span>
              <span className="rsub">
                {roomName(r.roomId)} ／ {purposeOf(r)}（{r.employeeName}）
              </span>
              {r.employeeId === props.selfId && <span className="tag">自分</span>}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
