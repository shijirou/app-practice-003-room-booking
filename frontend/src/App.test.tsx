import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  /** カレンダーの点（予約がある日）の返事 */
  days?: (range: string) => Response
  /** 予約を作る依頼（POST）への返事 */
  create?: (body: Record<string, unknown>) => Response
}

/** 予約を作るために送られた内容 */
let posts: Record<string, unknown>[] = []

/** fetch を偽物に差し替える。呼ばれた宛先（GET）の一覧を返す */
function mockApi({
  day = () => json([]),
  upcoming = () => json([]),
  days = () => json([]),
  create = () => json(reservation({ id: 200 }), 201),
}: Options = {}) {
  const calls: string[] = []
  posts = []
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>
        posts.push(body)
        return Promise.resolve(create(body))
      }
      calls.push(url)
      if (url === '/api/employees') return Promise.resolve(json(employees))
      if (url === '/api/rooms') return Promise.resolve(json(rooms))
      if (url.startsWith('/api/reservations?date=')) return Promise.resolve(day(url.split('=')[1]))
      if (url.startsWith('/api/reservation-days?')) return Promise.resolve(days(url))
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

  it('カレンダーの日付の下に、自分の予約は青い点、ほかの人の予約は灰色の点を出す', async () => {
    const calls = mockApi({
      days: () =>
        json([
          { date: '2026-11-20', employeeIds: [1, 2] },
          { date: '2026-11-21', employeeIds: [2] },
          { date: '2026-11-22', employeeIds: [1] },
        ]),
    })
    render(<App now={now} />)
    await screen.findByText('会議室A（4名）')

    await userEvent.click(screen.getByTitle('押すとカレンダーを開きます'))
    const calendar = screen.getByRole('dialog', { name: 'カレンダー' })
    await waitFor(() => expect(within(calendar).getAllByTestId('dot-mine')).toHaveLength(2))
    expect(calls).toContain('/api/reservation-days?from=2026-11-01&to=2026-12-12')
    const day = (d: string) => calendar.querySelector(`[data-date="${d}"]`) as HTMLElement
    expect(within(day('2026-11-20')).getByTestId('dot-mine')).toBeInTheDocument()
    expect(within(day('2026-11-20')).getByTestId('dot-other')).toBeInTheDocument() // 両方あれば 2 つ
    expect(within(day('2026-11-21')).queryByTestId('dot-mine')).not.toBeInTheDocument()
    expect(within(day('2026-11-21')).getByTestId('dot-other')).toBeInTheDocument()
    expect(within(day('2026-11-23')).queryByTestId('dot-other')).not.toBeInTheDocument()
  })

  it('カレンダーの外を押すと閉じるだけで、下の表には押した操作が届かない', async () => {
    mockApi()
    render(<App now={now} />)
    await screen.findByText('会議室A（4名）')

    await userEvent.click(screen.getByTitle('押すとカレンダーを開きます'))
    expect(screen.getByRole('dialog', { name: 'カレンダー' })).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('cell', { name: '10:00 空き' })[0])
    expect(screen.queryByRole('dialog', { name: 'カレンダー' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '予約' })).not.toBeInTheDocument() // 表の枠は反応しない

    await userEvent.click(screen.getAllByRole('cell', { name: '10:00 空き' })[0]) // 閉じたあとは、ふつうに押せる
    expect(screen.getByRole('dialog', { name: '予約' })).toBeInTheDocument()
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

    const mineTab = await screen.findByRole('tab', { name: '自分（田中架空）の予約2件' })
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

  describe('予約する', () => {
    /** 会議室 A の、指定した時刻の空き枠 */
    const freeCell = (time: string) => screen.getAllByRole('cell', { name: time + ' 空き' })[0]

    it('空き枠を押すと 30 分の小窓が開き、仮表示が出て、予約すると送って表を取り直し、お知らせを出す', async () => {
      let created = false
      const calls = mockApi({
        day: () => json(created ? [reservation({ id: 200, purpose: '打合せ' })] : []),
        create: () => {
          created = true
          return json(reservation({ id: 200, purpose: '打合せ' }), 201)
        },
      })
      render(<App now={now} />)
      await screen.findByText('会議室A（4名）')

      await userEvent.click(freeCell('10:00'))
      const dialog = screen.getByRole('dialog', { name: '予約' })
      expect(within(dialog).getByLabelText('開始')).toHaveValue('600')
      expect(within(dialog).getByLabelText('終了')).toHaveValue('630') // 30 分
      expect(screen.getByText('10:00〜10:30 予約中…')).toHaveClass('draft')

      await userEvent.selectOptions(within(dialog).getByLabelText('終了'), '690')
      expect(screen.getByText('10:00〜11:30 予約中…')).toBeInTheDocument()

      await userEvent.type(within(dialog).getByLabelText('用件'), '打合せ')
      await userEvent.click(within(dialog).getByRole('button', { name: '予約する' }))

      expect(await screen.findByRole('status')).toHaveTextContent('予約しました')
      expect(posts).toEqual([
        {
          employeeId: 1,
          roomId: 10,
          startAt: '2026-11-20T10:00:00+09:00',
          endAt: '2026-11-20T11:30:00+09:00',
          purpose: '打合せ',
        },
      ])
      expect(screen.queryByRole('dialog', { name: '予約' })).not.toBeInTheDocument()
      const mine = await screen.findByText('打合せ（田中）')
      expect(mine).toHaveClass('mine', 'flash')
      expect(calls.filter((c) => c === '/api/reservations?date=2026-11-20')).toHaveLength(2) // 最初と、予約後
    })

    it('用件が空なら null で送る。Enter でも送れる', async () => {
      mockApi()
      render(<App now={now} />)
      await screen.findByText('会議室A（4名）')

      await userEvent.click(freeCell('10:00'))
      await userEvent.type(screen.getByLabelText('用件'), '   {Enter}')
      await waitFor(() => expect(posts).toHaveLength(1))
      expect(posts[0].purpose).toBeNull()
    })

    it('次の予約があるときは、その開始までで小窓が開く', async () => {
      mockApi({
        day: () => json([reservation({ startAt: '2026-11-20T10:30:00+09:00', endAt: '2026-11-20T11:30:00+09:00' })]),
      })
      render(<App now={now} />)
      await screen.findByText('会議室A（4名）')

      await userEvent.click(freeCell('10:00'))
      expect(screen.getByLabelText('終了')).toHaveValue('630') // 10:30
    })

    it('サーバーが断ったら（重複など）、小窓の中に理由を出し、入力は消さない', async () => {
      mockApi({ create: () => json({ message: 'その時間はすでに予約があります' }, 409) })
      render(<App now={now} />)
      await screen.findByText('会議室A（4名）')

      await userEvent.click(freeCell('10:00'))
      await userEvent.type(screen.getByLabelText('用件'), '打合せ')
      await userEvent.click(screen.getByRole('button', { name: '予約する' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('その時間はすでに予約があります')
      expect(screen.getByLabelText('用件')).toHaveValue('打合せ')
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: '予約する' })).toBeEnabled() // 直して、もう一度送れる
    })

    it('今より前の時刻を選ぶと、送らずに理由を出す', async () => {
      mockApi()
      render(<App now={now} />)
      await screen.findByText('会議室A（4名）')

      await userEvent.click(freeCell('10:00'))
      await userEvent.selectOptions(screen.getByLabelText('開始'), '480') // 8:00
      await userEvent.click(screen.getByRole('button', { name: '予約する' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('今日は 9:00 以降から予約できます')
      expect(posts).toHaveLength(0)
    })

    it('開始を遅くすると終了も動く。日付を変えると表もその日になり、仮表示も移る', async () => {
      const calls = mockApi()
      render(<App now={now} />)
      await screen.findByText('会議室A（4名）')

      await userEvent.click(freeCell('10:00'))
      await userEvent.selectOptions(screen.getByLabelText('開始'), '720') // 12:00
      expect(screen.getByLabelText('終了')).toHaveValue('780') // 13:00（開始 + 1 時間）

      fireEvent.change(screen.getByLabelText('日付'), { target: { value: '2026-11-25' } })
      await waitFor(() => expect(calls).toContain('/api/reservations?date=2026-11-25'))
      expect(await screen.findByText('2026年11月25日（水）')).toBeInTheDocument()
      expect(await screen.findByText('12:00〜13:00 予約中…')).toBeInTheDocument()
    })

    it('Esc・×・やめる で閉じる。社員を変えても閉じる', async () => {
      mockApi()
      render(<App now={now} />)
      await screen.findByText('会議室A（4名）')

      await userEvent.click(freeCell('10:00'))
      await userEvent.keyboard('{Escape}')
      expect(screen.queryByRole('dialog', { name: '予約' })).not.toBeInTheDocument()
      expect(screen.queryByTestId('draft')).not.toBeInTheDocument()

      await userEvent.click(freeCell('10:00'))
      await userEvent.click(screen.getByRole('button', { name: '閉じる' }))
      expect(screen.queryByRole('dialog', { name: '予約' })).not.toBeInTheDocument()

      await userEvent.click(freeCell('10:00'))
      await userEvent.click(screen.getByRole('button', { name: 'やめる' }))
      expect(screen.queryByRole('dialog', { name: '予約' })).not.toBeInTheDocument()

      await userEvent.click(freeCell('10:00'))
      await userEvent.selectOptions(screen.getByRole('combobox', { name: /ログイン中/ }), '佐藤架空')
      expect(screen.queryByRole('dialog', { name: '予約' })).not.toBeInTheDocument()
    })

    it('過去の枠は押しても開かない', async () => {
      mockApi()
      render(<App now={now} />)
      await screen.findByText('会議室A（4名）')

      await userEvent.click(screen.getAllByRole('cell', { name: '8:00 過去' })[0])
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('ドラッグで長い時間を選ぶと、薄い青になり、離すとその範囲で小窓が開く（右から左も同じ）', async () => {
      mockApi()
      render(<App now={now} />)
      await screen.findByText('会議室A（4名）')

      fireEvent.mouseDown(freeCell('10:00'))
      fireEvent.mouseMove(freeCell('11:30'))
      expect(freeCell('11:00')).toHaveClass('sel')
      expect(freeCell('12:00')).not.toHaveClass('sel')
      fireEvent.mouseUp(document)
      let dialog = screen.getByRole('dialog', { name: '予約' })
      expect(within(dialog).getByLabelText('開始')).toHaveValue('600')
      expect(within(dialog).getByLabelText('終了')).toHaveValue('720') // 10:00〜12:00
      fireEvent.click(within(dialog).getByRole('button', { name: 'やめる' }))

      fireEvent.mouseDown(freeCell('15:00'))
      fireEvent.mouseMove(freeCell('13:00'))
      fireEvent.mouseUp(document)
      dialog = screen.getByRole('dialog', { name: '予約' })
      expect(within(dialog).getByLabelText('開始')).toHaveValue('780') // 13:00〜15:30
      expect(within(dialog).getByLabelText('終了')).toHaveValue('930')
    })

    it('ドラッグが予約済みと重なると赤くなり、離すとお知らせが出て小窓は開かない', async () => {
      mockApi({ day: () => json([reservation({ purpose: '営業定例' })]) }) // 10:00〜11:30
      render(<App now={now} />)
      const busy = await screen.findByText('営業定例（田中）')

      fireEvent.mouseDown(freeCell('9:30'))
      fireEvent.mouseMove(busy)
      expect(busy).toHaveClass('bad')
      fireEvent.mouseUp(document)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByText('その時間はすでに予約があります')).toBeInTheDocument()
      expect(busy).not.toHaveClass('bad')
    })

    it('ほかの会議室や過去の枠の上を通っても、選ぶ範囲は変わらない', async () => {
      mockApi()
      render(<App now={now} />)
      await screen.findByText('会議室A（4名）')

      fireEvent.mouseDown(freeCell('10:00'))
      fireEvent.mouseMove(screen.getAllByRole('cell', { name: '12:00 空き' })[1]) // 会議室 B
      fireEvent.mouseMove(screen.getAllByRole('cell', { name: '8:00 過去' })[0])
      fireEvent.mouseUp(document)
      const dialog = screen.getByRole('dialog', { name: '予約' })
      expect(within(dialog).getByLabelText('終了')).toHaveValue('630') // 押しただけと同じ 10:00〜10:30
    })
  })

  describe('予約の内容', () => {
    it('ほかの人の予約を押すと内容と「変更できません」が出る。Esc で閉じる', async () => {
      mockApi({ day: () => json([reservation({ employeeId: 2, employeeName: '佐藤架空', purpose: '商談' })]) })
      render(<App now={now} />)

      await userEvent.click(await screen.findByText('商談（佐藤）'))
      const dialog = screen.getByRole('dialog', { name: '予約の内容' })
      expect(within(dialog).getByText('10:00〜11:30')).toBeInTheDocument()
      expect(within(dialog).getByText(/会議室A ／ 2026年11月20日（金）/)).toBeInTheDocument()
      expect(within(dialog).getByText(/用件：商談/)).toBeInTheDocument()
      expect(within(dialog).getByText(/予約した人：佐藤架空/)).toBeInTheDocument()
      expect(within(dialog).getByText('他の人の予約は変更できません。')).toBeInTheDocument()

      await userEvent.keyboard('{Escape}')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('自分の始まった予約には「始まった予約は変更・キャンセルできません。」、これからの予約には何も付かない', async () => {
      mockApi({
        day: () =>
          json([
            reservation({ id: 1, startAt: '2026-11-20T08:30:00+09:00', endAt: '2026-11-20T09:30:00+09:00', purpose: '朝会' }),
            reservation({}),
          ]),
      })
      render(<App now={now} />)

      await userEvent.click(await screen.findByText('朝会（田中）'))
      expect(screen.getByText('始まった予約は変更・キャンセルできません。')).toBeInTheDocument()

      await userEvent.click(screen.getByText('営業定例（田中）'))
      expect(screen.queryByText('始まった予約は変更・キャンセルできません。')).not.toBeInTheDocument()
      expect(screen.queryByText('他の人の予約は変更できません。')).not.toBeInTheDocument()
    })

    it('「みんな」のカードを押しても、同じ内容が出る', async () => {
      window.scrollTo = vi.fn()
      mockApi({ day: () => json([reservation({})]) })
      render(<App now={now} />)

      await userEvent.click(await screen.findByRole('tab', { name: /の予約（みんな）/ }))
      await userEvent.click(screen.getByText('会議室A ／ 営業定例（田中架空）'))
      expect(screen.getByRole('dialog', { name: '予約の内容' })).toBeInTheDocument()
    })
  })
})
