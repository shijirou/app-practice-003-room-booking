import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const employees = [
  { id: 1, name: '田中架空' },
  { id: 2, name: '佐藤架空' },
]
const rooms = [
  { id: 10, name: '会議室A', capacity: 4 },
  { id: 11, name: '会議室B', capacity: 6 },
]
const reservation = (over: object) => ({
  id: 100,
  roomId: 10,
  employeeId: 1,
  employeeName: '田中架空',
  startAt: '2026-11-20T10:00:00+09:00',
  endAt: '2026-11-20T11:30:00+09:00',
  purpose: '営業定例',
  ...over,
})

// 2026-11-20 09:00（日本時間）に固定する
const now = () => new Date('2026-11-20T00:00:00Z')

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

type Options = {
  /** 日付ごとの予約の返事 */
  day?: (date: string) => Response
  /** 社員ごとの「今後の予約」の返事 */
  upcoming?: (employeeId: string) => Response
}

/** fetch を偽物に差し替える。呼ばれた宛先の一覧を返す */
function mockApi({ day = () => json([]), upcoming = () => json([]) }: Options = {}) {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      calls.push(url)
      if (url === '/api/employees') return Promise.resolve(json(employees))
      if (url === '/api/rooms') return Promise.resolve(json(rooms))
      if (url.startsWith('/api/reservations?date=')) return Promise.resolve(day(url.split('=')[1]))
      if (url.startsWith('/api/reservations?employeeId=')) return Promise.resolve(upcoming(url.split('=')[1]))
      return Promise.resolve(json({ message: '想定外' }, 500))
    }),
  )
  return calls
}

describe('App', () => {
  beforeEach(() => vi.unstubAllGlobals())
  afterEach(() => vi.unstubAllGlobals())

  it('今日の予約を表に出す（自分は青・ほかの人はグレー・つながった 1 つのセル）', async () => {
    const calls = mockApi({
      day: () =>
        json([
          reservation({}),
          reservation({ id: 101, roomId: 11, employeeId: 2, employeeName: '佐藤架空', purpose: null }),
        ]),
    })
    render(<App now={now} />)

    expect(await screen.findByText('会議室A（4名）')).toBeInTheDocument()
    expect(screen.getByText('2026年11月20日（金）')).toBeInTheDocument()
    expect(calls).toContain('/api/reservations?date=2026-11-20')

    const mine = screen.getByText('営業定例（田中）')
    expect(mine).toHaveClass('mine')
    expect(mine).toHaveAttribute('colspan', '3') // 10:00〜11:30 は 30 分 × 3
    const other = screen.getByText('（用件なし）（佐藤）')
    expect(other).toHaveClass('busy')
  })

  it('社員を切り替えると、自分の予約の色が変わり、その社員の今後の予約を取り直す', async () => {
    const calls = mockApi({ day: () => json([reservation({})]) })
    render(<App now={now} />)
    expect(await screen.findByText('営業定例（田中）')).toHaveClass('mine')
    expect(calls).toContain('/api/reservations?employeeId=1')

    await userEvent.selectOptions(screen.getByRole('combobox'), '佐藤架空')
    expect(screen.getByText('営業定例（田中）')).toHaveClass('busy')
    await waitFor(() => expect(calls).toContain('/api/reservations?employeeId=2'))
  })

  it('今日は今の時刻より前の枠が過去になり、現在時刻の線が出る。翌日は全部空きで線も無い', async () => {
    mockApi()
    render(<App now={now} />)
    await screen.findByText('会議室A（4名）')
    // 今日 9:00。8:00〜9:00 の 2 枠 × 2 室 = 4 つが過去。全 24 枠 × 2 室 = 48
    expect(screen.getAllByTestId('past')).toHaveLength(4)
    expect(screen.getAllByTestId('free')).toHaveLength(44)
    expect(screen.getByTestId('nowline')).toHaveStyle({ left: `${(60 / 720) * 100}%` })
    expect(screen.getByText('現在 9:00')).toBeInTheDocument()
    expect(screen.getByText(/今日は 9:00 以降/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '次の日' }))
    await waitFor(() => expect(screen.getByText('2026年11月21日（土）')).toBeInTheDocument())
    await waitFor(() => expect(screen.getAllByTestId('free')).toHaveLength(48))
    expect(screen.queryAllByTestId('past')).toHaveLength(0)
    expect(screen.queryByTestId('nowline')).not.toBeInTheDocument()
    expect(screen.getByText(/現在 9:00\s+今日 11\/20\(金\)/)).toBeInTheDocument() // 別の日を見ているときは今日も出す
  })

  it('前の日・今日のボタンで日付を動かし、その日の予約を取り直す', async () => {
    const calls = mockApi()
    render(<App now={now} />)
    await screen.findByText('会議室A（4名）')

    await userEvent.click(screen.getByRole('button', { name: '前の日' }))
    await waitFor(() => expect(calls).toContain('/api/reservations?date=2026-11-19'))
    await waitFor(() => expect(screen.getAllByTestId('past')).toHaveLength(48)) // 昨日は全部過去

    await userEvent.click(screen.getByRole('button', { name: '今日' }))
    await waitFor(() => expect(screen.getByText('2026年11月20日（金）')).toBeInTheDocument())
  })

  it('カレンダーを開いて日付を選べる（選んでも閉じず、×で閉じる）', async () => {
    const calls = mockApi()
    render(<App now={now} />)
    await screen.findByText('会議室A（4名）')

    await userEvent.click(screen.getByTitle('押すとカレンダーを開きます'))
    const calendar = screen.getByRole('dialog', { name: 'カレンダー' })
    expect(within(calendar).getByText('2026年11月')).toBeInTheDocument()

    await userEvent.click(within(calendar).getByRole('button', { name: '次の月' }))
    expect(within(calendar).getByText('2026年12月')).toBeInTheDocument()
    await userEvent.click(within(calendar).getByRole('button', { name: '25' }))
    await waitFor(() => expect(calls).toContain('/api/reservations?date=2026-12-25'))
    expect(screen.getByRole('dialog', { name: 'カレンダー' })).toBeInTheDocument() // 開いたまま

    await userEvent.click(within(calendar).getByRole('button', { name: '閉じる' }))
    expect(screen.queryByRole('dialog', { name: 'カレンダー' })).not.toBeInTheDocument()
  })

  it('「？」で色の説明が開き、Esc で閉じる', async () => {
    mockApi()
    render(<App now={now} />)
    await screen.findByText('会議室A（4名）')

    await userEvent.click(screen.getByRole('button', { name: '色の説明を見る' }))
    expect(screen.getByText('ほかの人の予約', { selector: '.li' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByText('ほかの人の予約', { selector: '.li' })).not.toBeInTheDocument()
  })

  it('下の欄: 自分の今後の予約（進行中も出す）とその日のみんなの予約をタブで切り替える', async () => {
    mockApi({
      day: () =>
        json([
          reservation({}),
          reservation({
            id: 101,
            roomId: 11,
            employeeId: 2,
            employeeName: '佐藤架空',
            startAt: '2026-11-20T13:00:00+09:00',
            endAt: '2026-11-20T14:00:00+09:00',
            purpose: '商談',
          }),
        ]),
      upcoming: () =>
        json([
          // 8:30〜9:30 は今（9:00）進行中
          reservation({ id: 90, startAt: '2026-11-20T08:30:00+09:00', endAt: '2026-11-20T09:30:00+09:00', purpose: '朝会' }),
          reservation({ id: 91, startAt: '2026-11-25T10:00:00+09:00', endAt: '2026-11-25T11:00:00+09:00', purpose: '研修' }),
          // 9:00 に終わった予約は「今後」に出さない
          reservation({ id: 92, startAt: '2026-11-20T08:00:00+09:00', endAt: '2026-11-20T09:00:00+09:00', purpose: '終わった' }),
        ]),
    })
    render(<App now={now} />)

    const mineTab = await screen.findByRole('tab', { name: '自分（田中架空）の予約（今後）2件' })
    expect(mineTab).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByText('会議室A ／ 朝会')).toBeInTheDocument()
    expect(screen.getByText('進行中')).toBeInTheDocument()
    expect(screen.getByText('11/25(水) 10:00〜11:00')).toBeInTheDocument()
    expect(screen.queryByText(/終わった/)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: '11/20(金) の予約（みんな）2件' }))
    expect(screen.getByText('会議室A ／ 営業定例（田中架空）')).toBeInTheDocument()
    expect(screen.getByText('会議室B ／ 商談（佐藤架空）')).toBeInTheDocument()
    expect(screen.getByText('自分')).toBeInTheDocument() // 自分の予約にだけ付く目印
  })

  it('自分の予約のカードを押すと、その日にジャンプする', async () => {
    const calls = mockApi({
      upcoming: () =>
        json([reservation({ id: 91, startAt: '2026-11-25T10:00:00+09:00', endAt: '2026-11-25T11:00:00+09:00', purpose: '研修' })]),
    })
    window.scrollTo = vi.fn()
    render(<App now={now} />)

    await userEvent.click(await screen.findByText('会議室A ／ 研修'))
    await waitFor(() => expect(calls).toContain('/api/reservations?date=2026-11-25'))
    expect(screen.getByText('2026年11月25日（水）')).toBeInTheDocument()
  })

  it('表の枠にカーソルを重ねると、同じ予約のカードが強調される', async () => {
    mockApi({ day: () => json([reservation({})]) })
    render(<App now={now} />)
    await userEvent.click(await screen.findByRole('tab', { name: /の予約（みんな）/ }))
    const card = screen.getByText('会議室A ／ 営業定例（田中架空）').closest('.rcard')
    expect(card).not.toHaveClass('hl')

    await userEvent.hover(screen.getByText('営業定例（田中）'))
    expect(card).toHaveClass('hl')
  })

  it('読み込みに失敗したらメッセージを出し、押すとやり直す', async () => {
    let fail = true
    mockApi({ day: () => (fail ? json({ message: 'エラーが起きました' }, 500) : json([])) })
    render(<App now={now} />)

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText(/エラーが起きました/)).toBeInTheDocument()
    expect(screen.getByText('2026年11月20日（金）')).toBeInTheDocument() // 日付は残る

    fail = false
    await userEvent.click(within(alert).getByRole('button', { name: 'もう一度読み込む' }))
    expect(await screen.findByText('会議室A（4名）')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('サーバーにつながらないときも、分かる文を出す', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('network'))))
    render(<App now={now} />)
    expect(await screen.findByText(/サーバーにつながりません/)).toBeInTheDocument()
  })

  it('日付を変えても、下の欄は消えず、選んだタブのまま', async () => {
    mockApi({ day: (date) => json(date === '2026-11-20' ? [reservation({})] : []) })
    render(<App now={now} />)
    await userEvent.click(await screen.findByRole('tab', { name: /の予約（みんな）/ }))

    await userEvent.click(screen.getByRole('button', { name: '次の日' }))
    const dayTab = await screen.findByRole('tab', { name: '11/21(土) の予約（みんな）0件' })
    expect(dayTab).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByText('この日の予約はまだありません')).toBeInTheDocument()
  })

  it('自分の予約の読み込みに失敗したら、やり直すボタンが出る', async () => {
    let fail = true
    mockApi({ upcoming: () => (fail ? json({ message: 'エラーが起きました' }, 500) : json([])) })
    render(<App now={now} />)

    const alert = await screen.findByRole('alert')
    fail = false
    await userEvent.click(within(alert).getByRole('button', { name: 'もう一度読み込む' }))
    expect(await screen.findByText(/予約はまだありません/)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
