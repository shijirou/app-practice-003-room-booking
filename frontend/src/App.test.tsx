import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  /** 予約を変更する依頼（PUT）への返事 */
  update?: (id: string, body: Record<string, unknown>) => Response
  /** 予約をキャンセルする依頼（DELETE）への返事 */
  cancel?: (url: string) => Response
}

/** 予約を作るために送られた内容 */
let posts: Record<string, unknown>[] = []
/** 予約を変更するために送られた内容（宛先の id つき） */
let puts: { id: string; body: Record<string, unknown> }[] = []
/** キャンセルするために送られた宛先 */
let deletes: string[] = []

/** fetch を偽物に差し替える。呼ばれた宛先（GET）の一覧を返す */
function mockApi({
  day = () => json([]),
  upcoming = () => json([]),
  days = () => json([]),
  create = () => json(reservation({ id: 200 }), 201),
  update = () => json(reservation({})),
  cancel = () => new Response(null, { status: 204 }),
}: Options = {}) {
  const calls: string[] = []
  posts = []
  puts = []
  deletes = []
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        deletes.push(url)
        return Promise.resolve(cancel(url))
      }
      if (init?.method === 'PUT') {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>
        const id = url.split('/').pop() ?? ''
        puts.push({ id, body })
        return Promise.resolve(update(id, body))
      }
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
    // 「今後の予約」の取得は、表が出たあとの effect で始まるので、少し待つ（待たないと、たまに失敗する）
    await waitFor(() => expect(calls).toContain('/api/reservations?employeeId=1'))

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

  it('カレンダーの「今月」は、表示を今月に戻すだけで、選んでいる日付は変えない', async () => {
    mockApi()
    render(<App now={now} />)
    await screen.findByText('会議室A（4名）')

    await userEvent.click(screen.getByTitle('押すとカレンダーを開きます'))
    const calendar = screen.getByRole('dialog', { name: 'カレンダー' })
    await userEvent.click(within(calendar).getByRole('button', { name: '次の月' }))
    expect(within(calendar).getByText('2026年12月')).toBeInTheDocument()

    await userEvent.click(within(calendar).getByRole('button', { name: '今月' }))
    expect(within(calendar).getByText('2026年11月')).toBeInTheDocument()
    expect(screen.getByText('2026年11月20日（金）')).toBeInTheDocument() // 日付は今日のまま
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
    expect(calls).toContain('/api/reservation-days?from=2026-11-01&to=2026-12-05')
    const day = (d: string) => calendar.querySelector(`[data-date="${d}"]`) as HTMLElement
    expect(within(day('2026-11-20')).getByTestId('dot-mine')).toBeInTheDocument()
    expect(within(day('2026-11-20')).getByTestId('dot-other')).toBeInTheDocument() // 両方あれば 2 つ
    expect(within(day('2026-11-21')).queryByTestId('dot-mine')).not.toBeInTheDocument()
    expect(within(day('2026-11-21')).getByTestId('dot-other')).toBeInTheDocument()
    expect(within(day('2026-11-23')).queryByTestId('dot-other')).not.toBeInTheDocument()
  })

  it('カレンダーからカーソルが外れると半透明になり、重ねると戻る。外を押すと閉じ、下の表には押した操作が届かない', async () => {
    mockApi()
    render(<App now={now} />)
    await screen.findByText('会議室A（4名）')

    await userEvent.click(screen.getByTitle('押すとカレンダーを開きます'))
    const calendar = screen.getByRole('dialog', { name: 'カレンダー' })
    expect(calendar).not.toHaveClass('faded')
    const wrap = calendar.parentElement as HTMLElement // 日付ボタンとカレンダーを囲む枠
    fireEvent.mouseLeave(wrap) // カーソルが外へ
    expect(calendar).toHaveClass('faded')
    fireEvent.mouseEnter(wrap)
    expect(calendar).not.toHaveClass('faded') // 重ねると元の濃さ

    await userEvent.click(screen.getAllByRole('gridcell', { name: '10:00 空き' })[0]) // 外を押す
    expect(screen.queryByRole('dialog', { name: 'カレンダー' })).not.toBeInTheDocument() // 閉じる
    expect(screen.queryByRole('dialog', { name: '予約' })).not.toBeInTheDocument() // 表の枠は反応しない

    await userEvent.click(screen.getAllByRole('gridcell', { name: '10:00 空き' })[0]) // 閉じたあとは、ふつうに押せる
    expect(screen.getByRole('dialog', { name: '予約' })).toBeInTheDocument()
  })

  it('下の欄の白い背景部分を押すと、カレンダーは閉じる（タブや予約カードのときは閉じない）', async () => {
    mockApi({
      upcoming: () => json([reservation({ id: 300, startAt: '2026-12-25T10:00:00+09:00', endAt: '2026-12-25T11:00:00+09:00', purpose: '年末会議' })]),
    })
    render(<App now={now} />)
    await screen.findByText('会議室A（4名）')

    await userEvent.click(screen.getByTitle('押すとカレンダーを開きます'))
    await userEvent.click(await screen.findByRole('tab', { name: /の予約（みんな）/ })) // タブは閉じない
    expect(screen.getByRole('dialog', { name: 'カレンダー' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tabpanel')) // 白い背景部分
    expect(screen.queryByRole('dialog', { name: 'カレンダー' })).not.toBeInTheDocument()
  })

  it('カレンダーを開いたまま、下の欄の予約を押すと、その日に移り、カレンダーは閉じない', async () => {
    mockApi({
      upcoming: () =>
        json([reservation({ id: 300, startAt: '2026-12-25T10:00:00+09:00', endAt: '2026-12-25T11:00:00+09:00', purpose: '年末会議' })]),
    })
    render(<App now={now} />)
    await screen.findByText('会議室A（4名）')

    await userEvent.click(screen.getByTitle('押すとカレンダーを開きます'))
    const calendar = screen.getByRole('dialog', { name: 'カレンダー' })
    await userEvent.click(await screen.findByText('会議室A ／ 年末会議'))
    expect(await screen.findByText('2026年12月25日（金）')).toBeInTheDocument() // 日付が移った
    expect(screen.getByRole('dialog', { name: 'カレンダー' })).toBe(calendar) // 閉じない
    expect(within(calendar).getByText('2026年12月')).toBeInTheDocument() // 表示月も合わせる
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

  describe('読み上げ・キーボード向けの目印（ARIA）', () => {
    it('タブ: 欄との対応の目印が付き、選んでいるタブだけ Tab で入れる', async () => {
      mockApi()
      render(<App now={now} />)
      const mineTab = await screen.findByRole('tab', { name: /^自分（田中架空）の予約/ })
      const dayTab = screen.getByRole('tab', { name: /の予約（みんな）/ })

      const panel = screen.getByRole('tabpanel')
      expect(mineTab).toHaveAttribute('aria-controls', panel.id)
      expect(panel).toHaveAttribute('aria-labelledby', mineTab.id)
      expect(mineTab).toHaveAttribute('tabindex', '0')
      expect(dayTab).toHaveAttribute('tabindex', '-1')

      await userEvent.click(dayTab)
      expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', dayTab.id)
      expect(dayTab).toHaveAttribute('tabindex', '0')
      expect(mineTab).toHaveAttribute('tabindex', '-1')
    })

    it('タブ: ← → Home End で切り替わり、キーボードの位置もついていく', async () => {
      mockApi()
      render(<App now={now} />)
      const mineTab = await screen.findByRole('tab', { name: /^自分（田中架空）の予約/ })
      const dayTab = screen.getByRole('tab', { name: /の予約（みんな）/ })

      mineTab.focus()
      await userEvent.keyboard('{ArrowRight}')
      expect(dayTab).toHaveAttribute('aria-selected', 'true')
      expect(dayTab).toHaveFocus()
      await userEvent.keyboard('{ArrowRight}') // 端から先頭へ回る
      expect(mineTab).toHaveAttribute('aria-selected', 'true')
      expect(mineTab).toHaveFocus()
      await userEvent.keyboard('{ArrowLeft}') // 先頭から末尾へ回る
      expect(dayTab).toHaveFocus()
      await userEvent.keyboard('{Home}')
      expect(mineTab).toHaveFocus()
      await userEvent.keyboard('{End}')
      expect(dayTab).toHaveFocus()
    })

    it('予約表: grid 役割と名前があり、予約済みのマスは時間・用件・予約した人で読み上げられる', async () => {
      mockApi({
        day: () =>
          json([
            reservation({}),
            reservation({ id: 101, roomId: 11, employeeId: 2, employeeName: '佐藤架空', startAt: '2026-11-20T13:00:00+09:00', endAt: '2026-11-20T14:00:00+09:00', purpose: '商談' }),
          ]),
      })
      render(<App now={now} />)
      expect(await screen.findByRole('grid', { name: /会議室ごとの予約表/ })).toBeInTheDocument()

      expect(await screen.findByRole('gridcell', { name: /商談（佐藤架空）$/ })).toBeInTheDocument()
      expect(screen.getByRole('gridcell', { name: /（田中架空） 自分の予約$/ })).toBeInTheDocument()
      // 過去のマスは「操作できない」と伝わる
      expect(screen.getAllByRole('gridcell', { name: '8:00 過去' })[0]).toHaveAttribute('aria-disabled', 'true')
      expect(screen.getAllByRole('gridcell', { name: '12:00 空き' })[0]).not.toHaveAttribute('aria-disabled')
    })
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
    const freeCell = (time: string) => screen.getAllByRole('gridcell', { name: time + ' 空き' })[0]

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

      await userEvent.click(screen.getAllByRole('gridcell', { name: '8:00 過去' })[0])
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

    it('ドラッグして開始の枠に戻して離したら、小窓は開かない（30 分の予約は押すだけ）', async () => {
      mockApi()
      render(<App now={now} />)
      await screen.findByText('会議室A（4名）')

      fireEvent.mouseDown(freeCell('10:00'))
      fireEvent.mouseMove(freeCell('11:00'))
      expect(freeCell('10:30')).toHaveClass('sel')
      fireEvent.mouseMove(freeCell('10:00'))
      fireEvent.mouseUp(document)
      expect(screen.queryByRole('dialog', { name: '予約' })).not.toBeInTheDocument()
      expect(freeCell('10:00')).not.toHaveClass('sel') // 選択も消える
    })

    it('ドラッグ中に上下の別の会議室へずれても、横の位置で開始の会議室の選択を続ける', async () => {
      mockApi()
      render(<App now={now} />)
      await screen.findByText('会議室A（4名）')

      // 画面のない試験環境では枠の位置が取れないので、会議室 A の 12:00 の枠が x=100〜150 にあることにする
      vi.spyOn(freeCell('12:00'), 'getBoundingClientRect').mockReturnValue({ left: 100, right: 150 } as DOMRect)
      fireEvent.mouseDown(freeCell('10:00'))
      fireEvent.mouseMove(screen.getAllByRole('gridcell', { name: '12:00 空き' })[1], { clientX: 120 }) // 会議室 B の上
      expect(freeCell('11:00')).toHaveClass('sel')
      expect(freeCell('12:00')).toHaveClass('sel')
      expect(freeCell('12:30')).not.toHaveClass('sel')
      fireEvent.mouseUp(document)
      const dialog = screen.getByRole('dialog', { name: '予約' })
      expect(within(dialog).getByLabelText('会議室')).toHaveValue('10') // 開始した会議室 A のまま
      expect(within(dialog).getByLabelText('終了')).toHaveValue('750') // 10:00〜12:30
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
      fireEvent.mouseMove(screen.getAllByRole('gridcell', { name: '12:00 空き' })[1]) // 会議室 B
      fireEvent.mouseMove(screen.getAllByRole('gridcell', { name: '8:00 過去' })[0])
      fireEvent.mouseUp(document)
      const dialog = screen.getByRole('dialog', { name: '予約' })
      expect(within(dialog).getByLabelText('終了')).toHaveValue('630') // 押しただけと同じ 10:00〜10:30
    })
  })

  describe('予約の内容の開け閉め', () => {
    it('同じ「みんな」のカードをもう一度押すと、予約の内容が閉じる', async () => {
      mockApi({ day: () => json([reservation({ employeeId: 2, employeeName: '佐藤架空', purpose: '商談' })]) })
      render(<App now={now} />)
      await userEvent.click(await screen.findByRole('tab', { name: /の予約（みんな）/ }))
      const card = screen.getByText('会議室A ／ 商談（佐藤架空）')

      await userEvent.click(card)
      expect(screen.getByRole('dialog', { name: '予約の内容' })).toBeInTheDocument()
      await userEvent.click(card)
      expect(screen.queryByRole('dialog', { name: '予約の内容' })).not.toBeInTheDocument()
      await userEvent.click(card) // もう一度押せば、また開く
      expect(screen.getByRole('dialog', { name: '予約の内容' })).toBeInTheDocument()
    })

    it('表の予約枠も、同じ枠をもう一度押すと閉じる', async () => {
      mockApi({ day: () => json([reservation({ employeeId: 2, employeeName: '佐藤架空', purpose: '商談' })]) })
      render(<App now={now} />)
      const cell = await screen.findByText('商談（佐藤）')

      await userEvent.click(cell)
      expect(screen.getByRole('dialog', { name: '予約の内容' })).toBeInTheDocument()
      await userEvent.click(cell)
      expect(screen.queryByRole('dialog', { name: '予約の内容' })).not.toBeInTheDocument()
    })

    it('カレンダーを開いたまま、予約の内容の「×」を押しても、カレンダーは閉じない', async () => {
      mockApi({ day: () => json([reservation({ employeeId: 2, employeeName: '佐藤架空', purpose: '商談' })]) })
      render(<App now={now} />)
      await userEvent.click(await screen.findByTitle('押すとカレンダーを開きます'))
      await userEvent.click(await screen.findByRole('tab', { name: /の予約（みんな）/ }))
      await userEvent.click(screen.getByText('会議室A ／ 商談（佐藤架空）'))
      const calendar = screen.getByRole('dialog', { name: 'カレンダー' })

      await userEvent.click(within(screen.getByRole('dialog', { name: '予約の内容' })).getByRole('button', { name: '閉じる' }))
      expect(screen.queryByRole('dialog', { name: '予約の内容' })).not.toBeInTheDocument()
      expect(screen.getByRole('dialog', { name: 'カレンダー' })).toBe(calendar) // カレンダーは残る
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

  describe('時間のリストと表の青枠の連動', () => {
    // 今日 9:00。空き枠 10:00 を押して、10:00〜10:30 の小窓を開いた状態から始める
    const open = async () => {
      mockApi()
      render(<App now={now} />)
      await screen.findByText('会議室A（4名）')
      await userEvent.click(screen.getAllByRole('gridcell', { name: '10:00 空き' })[0])
      return screen.getByRole('dialog', { name: '予約' })
    }
    const item = (name: string) => screen.getByRole('button', { name, hidden: true })

    it('終了の欄を押すと自作のリストが開き、時刻にカーソルを合わせると青枠が伸び、外へ出ると元に戻る', async () => {
      const dialog = await open()
      expect(screen.getByText('10:00〜10:30 予約中…')).toBeInTheDocument()

      await userEvent.click(within(dialog).getByLabelText('終了'))
      await userEvent.hover(item('12:00'))
      expect(screen.getByText('10:00〜12:00 予約中…')).toHaveClass('draft') // 決定前の仮表示
      expect(within(dialog).getByLabelText('終了')).toHaveValue('630') // 値はまだ変わらない

      await userEvent.hover(item('11:00'))
      expect(screen.getByText('10:00〜11:00 予約中…')).toBeInTheDocument()

      await userEvent.unhover(item('11:00')) // リストの外へ出る
      expect(screen.getByText('10:00〜10:30 予約中…')).toBeInTheDocument()
    })

    it('時刻を押すと決定して、リストが閉じる（青枠はそのまま）', async () => {
      const dialog = await open()
      await userEvent.click(within(dialog).getByLabelText('終了'))
      await userEvent.hover(item('12:00'))
      await userEvent.click(item('12:00'))

      expect(within(dialog).getByLabelText('終了')).toHaveValue('720')
      expect(screen.getByText('10:00〜12:00 予約中…')).toBeInTheDocument()
      expect(document.querySelector('.timelist')).toBeNull()
    })

    it('開始の欄では、開始が終了以後になる時刻にカーソルを合わせると、枠は 1 時間分になる', async () => {
      const dialog = await open()
      await userEvent.click(within(dialog).getByLabelText('開始'))
      await userEvent.hover(item('13:00'))
      expect(screen.getByText('13:00〜14:00 予約中…')).toBeInTheDocument()
      await userEvent.hover(item('9:30'))
      expect(screen.getByText('9:30〜10:30 予約中…')).toBeInTheDocument() // 終了は、元のまま
    })

    it('Esc・欄の外を押すと、決定せずに閉じて元に戻る（小窓は閉じない）', async () => {
      const dialog = await open()
      const end = within(dialog).getByLabelText('終了')

      await userEvent.click(end)
      await userEvent.hover(item('12:00'))
      await userEvent.keyboard('{Escape}')
      expect(document.querySelector('.timelist')).toBeNull()
      expect(screen.getByRole('dialog', { name: '予約' })).toBeInTheDocument()
      expect(end).toHaveValue('630')
      expect(screen.getByText('10:00〜10:30 予約中…')).toBeInTheDocument()

      await userEvent.click(end)
      await userEvent.hover(item('12:00'))
      await userEvent.click(within(dialog).getByLabelText('用件')) // 小窓の中の別の場所
      expect(document.querySelector('.timelist')).toBeNull()
      expect(end).toHaveValue('630')
      expect(screen.getByText('10:00〜10:30 予約中…')).toBeInTheDocument()
    })

    it('キーボード: Space で開き、↓ で時刻を選ぶたびに青枠が動き、Enter で決定。Esc なら取り消し', async () => {
      const dialog = await open()
      const end = within(dialog).getByLabelText('終了')
      end.focus()

      await userEvent.keyboard(' ')
      expect(document.querySelector('.timelist')).not.toBeNull()
      await userEvent.keyboard('{ArrowDown}{ArrowDown}')
      expect(screen.getByText('10:00〜11:30 予約中…')).toBeInTheDocument()
      await userEvent.keyboard('{Enter}')
      expect(end).toHaveValue('690')
      expect(document.querySelector('.timelist')).toBeNull()

      await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}')
      await userEvent.keyboard('{ArrowDown}')
      expect(screen.getByText('10:00〜12:00 予約中…')).toBeInTheDocument()
      await userEvent.keyboard('{Escape}')
      expect(end).toHaveValue('690')
      expect(screen.getByText('10:00〜11:30 予約中…')).toBeInTheDocument()
      expect(screen.getByRole('dialog', { name: '予約' })).toBeInTheDocument()
    })

    it('4 時間を超える時刻は、リストで赤く、青枠も赤になる（ちょうど 4 時間までは青）', async () => {
      const dialog = await open() // 10:00〜10:30
      await userEvent.click(within(dialog).getByLabelText('終了'))
      expect(item('14:00')).not.toHaveClass('bad')
      expect(item('14:30')).toHaveClass('bad')

      await userEvent.hover(item('14:00'))
      expect(screen.getByText('10:00〜14:00 予約中…')).not.toHaveClass('invalid')
      await userEvent.hover(item('14:30'))
      expect(screen.getByText('10:00〜14:30 予約中…')).toHaveClass('invalid')
      expect(item('14:30')).toHaveClass('hl')

      await userEvent.click(item('14:30')) // 決定しても赤のまま（そのままでは送れない）
      expect(screen.getByText('10:00〜14:30 予約中…')).toHaveClass('invalid')
      await userEvent.click(within(dialog).getByLabelText('終了'))
      await userEvent.hover(item('12:00'))
      expect(screen.getByText('10:00〜12:00 予約中…')).not.toHaveClass('invalid')
    })

    it('開始のリストでは、今より前（過去）の時刻が赤い（今日 9:00）', async () => {
      const dialog = await open()
      await userEvent.click(within(dialog).getByLabelText('開始'))
      expect(item('8:30')).toHaveClass('bad')
      expect(item('9:00')).not.toHaveClass('bad')
      await userEvent.hover(item('8:00'))
      expect(screen.getByText('8:00〜10:30 予約中…')).toHaveClass('invalid')
    })

    it('リストのスクロールバー（項目ではない部分）を押しても、リストは閉じない', async () => {
      const dialog = await open()
      await userEvent.click(within(dialog).getByLabelText('終了'))
      const list = document.querySelector('.timelist') as HTMLElement

      await userEvent.pointer({ keys: '[MouseLeft>]', target: list }) // ボタンを押したまま（つまんで動かす途中）
      expect(document.querySelector('.timelist')).not.toBeNull()
      expect(within(dialog).getByLabelText('終了')).toHaveFocus()
      await userEvent.pointer({ keys: '[/MouseLeft]', target: list })
      expect(document.querySelector('.timelist')).not.toBeNull()
    })

    it('リストを開いたまま小窓を閉じても、次に開いた小窓に仮表示が残らない', async () => {
      const dialog = await open()
      await userEvent.click(within(dialog).getByLabelText('終了'))
      await userEvent.hover(item('12:00'))
      await userEvent.click(within(dialog).getByRole('button', { name: '閉じる' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

      await userEvent.click(screen.getAllByRole('gridcell', { name: '13:00 空き' })[0])
      expect(screen.getByText('13:00〜13:30 予約中…')).toBeInTheDocument()
    })
  })

  describe('予約表の矢印キー操作', () => {
    // 今日 9:00。会議室 A に 10:00〜11:30 の自分の予約がある
    const setup = async () => {
      mockApi({ day: () => json([reservation({})]) })
      render(<App now={now} />)
      await screen.findByText('営業定例（田中）')
    }
    const cell = (label: string, room = 0) => screen.getAllByRole('gridcell', { name: label })[room]
    const focus = (el: HTMLElement) => act(() => el.focus())

    it('表の中で Tab が止まるのは 1 か所（最初の会議室の、予約できる最初の枠）。過去の枠は止まらない', async () => {
      await setup()
      const stops = Array.from(document.querySelectorAll('.timetable td[tabindex="0"]'))
      expect(stops).toHaveLength(1)
      expect(stops[0]).toBe(cell('9:00 空き'))
      expect(cell('8:00 過去')).not.toHaveAttribute('tabindex')
    })

    it('← → は同じ会議室で 1 マスずつ（予約済みは 1 マスで飛び越える）。Home・End は行の端', async () => {
      await setup()
      focus(cell('9:30 空き'))
      await userEvent.keyboard('{ArrowRight}')
      expect(screen.getByText('営業定例（田中）')).toHaveFocus() // 10:00〜11:30 は 1 マス
      await userEvent.keyboard('{ArrowRight}')
      expect(cell('11:30 空き')).toHaveFocus()
      await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
      expect(cell('9:30 空き')).toHaveFocus()
      await userEvent.keyboard('{End}')
      expect(cell('19:30 空き')).toHaveFocus()
      await userEvent.keyboard('{Home}')
      expect(cell('9:00 空き')).toHaveFocus() // 8:00〜9:00 は過去なので、9:00 が左端
      await userEvent.keyboard('{ArrowLeft}') // 端では動かない
      expect(cell('9:00 空き')).toHaveFocus()
    })

    it('↑ ↓ は別の会議室の同じ時刻へ。表の外には出ない。Tab が止まる位置も、動いた先になる', async () => {
      await setup()
      focus(cell('9:30 空き'))
      await userEvent.keyboard('{ArrowDown}')
      expect(cell('9:30 空き', 1)).toHaveFocus()
      await userEvent.keyboard('{ArrowDown}') // いちばん下
      expect(cell('9:30 空き', 1)).toHaveFocus()
      await userEvent.keyboard('{ArrowUp}{ArrowUp}')
      expect(cell('9:30 空き', 0)).toHaveFocus()
      await userEvent.keyboard('{ArrowDown}')
      expect(document.querySelector('.timetable td[tabindex="0"]')).toBe(cell('9:30 空き', 1))
    })

    it('空き枠で Enter を押すと 30 分の小窓が開き、キーボードの位置が小窓に移る。Esc で閉じると元のマスへ戻る', async () => {
      await setup()
      focus(cell('9:30 空き', 1))
      await userEvent.keyboard('{Enter}')
      const dialog = screen.getByRole('dialog', { name: '予約' })
      expect(within(dialog).getByLabelText('会議室')).toHaveValue('11')
      expect(within(dialog).getByLabelText('開始')).toHaveValue('570')
      expect(within(dialog).getByLabelText('終了')).toHaveValue('600')
      expect(within(dialog).getByLabelText('会議室')).toHaveFocus()

      await userEvent.keyboard('{Escape}')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(cell('9:30 空き', 1)).toHaveFocus()
    })

    it('予約済みの枠で Enter を押すと予約の内容が開き、［変更する］に位置が移る', async () => {
      await setup()
      focus(screen.getByText('営業定例（田中）'))
      await userEvent.keyboard('{Enter}')
      const dialog = screen.getByRole('dialog', { name: '予約の内容' })
      expect(within(dialog).getByRole('button', { name: '変更する' })).toHaveFocus()
      await userEvent.keyboard('{Escape}')
      expect(screen.getByText('営業定例（田中）')).toHaveFocus()
    })

    it('Shift + → で範囲を広げ、Enter でその範囲の小窓が開く。Shift + ← で縮められる', async () => {
      await setup()
      focus(cell('9:00 空き', 1))
      await userEvent.keyboard('{Shift>}{ArrowRight}{ArrowRight}{/Shift}')
      expect(document.querySelectorAll('.timetable td.sel')).toHaveLength(3) // 9:00・9:30・10:00
      await userEvent.keyboard('{Shift>}{ArrowLeft}{/Shift}')
      expect(document.querySelectorAll('.timetable td.sel')).toHaveLength(2)
      await userEvent.keyboard('{Enter}')

      const dialog = screen.getByRole('dialog', { name: '予約' })
      expect(within(dialog).getByLabelText('会議室')).toHaveValue('11')
      expect(within(dialog).getByLabelText('開始')).toHaveValue('540')
      expect(within(dialog).getByLabelText('終了')).toHaveValue('600') // 9:00〜10:00
      expect(document.querySelectorAll('.timetable td.sel')).toHaveLength(0)
    })

    it('範囲が予約済みと重なると赤くなり、Enter では小窓は開かずお知らせが出る。Esc で選択をやめられる', async () => {
      await setup()
      focus(cell('9:30 空き'))
      await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}') // 10:00 は予約済み
      expect(screen.getByText('営業定例（田中）')).toHaveClass('bad')
      await userEvent.keyboard('{Enter}')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(await screen.findByRole('status')).toHaveTextContent('その時間はすでに予約があります')
      expect(screen.getByText('営業定例（田中）')).not.toHaveClass('bad')

      await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}')
      expect(screen.getByText('営業定例（田中）')).toHaveClass('bad')
      await userEvent.keyboard('{Escape}')
      expect(screen.getByText('営業定例（田中）')).not.toHaveClass('bad')
      expect(document.querySelectorAll('.timetable td.sel')).toHaveLength(0)
    })

    it('予約済みの枠からは範囲を選び始めない。普通に移ると、選んでいた範囲はやめる', async () => {
      await setup()
      focus(screen.getByText('営業定例（田中）'))
      await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}')
      expect(document.querySelectorAll('.timetable td.sel')).toHaveLength(0)

      focus(cell('9:00 空き'))
      await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}')
      expect(document.querySelectorAll('.timetable td.sel')).toHaveLength(2)
      await userEvent.keyboard('{ArrowDown}')
      expect(document.querySelectorAll('.timetable td.sel')).toHaveLength(0)
    })

    it('［＋ 予約する］ボタンから開いた小窓を閉じると、ボタンに戻る', async () => {
      await setup()
      const button = screen.getByRole('button', { name: '＋ 予約する' })
      focus(button)
      await userEvent.keyboard('{Enter}')
      expect(screen.getByRole('dialog', { name: '予約' })).toBeInTheDocument()
      await userEvent.keyboard('{Escape}')
      expect(button).toHaveFocus()
    })
  })

  describe('［＋ 予約する］ボタン（キーボードだけで予約を始める）', () => {
    it('キーボードの Enter で押すと、最初の空き 30 分の小窓が開き、会議室の欄にキーボードの位置が移る', async () => {
      mockApi({
        day: () => json([reservation({ startAt: '2026-11-20T09:00:00+09:00', endAt: '2026-11-20T10:30:00+09:00' })]),
      })
      render(<App now={now} />)
      const button = await screen.findByRole('button', { name: '＋ 予約する' })
      await waitFor(() => expect(button).toBeEnabled())

      button.focus()
      await userEvent.keyboard('{Enter}')

      const dialog = screen.getByRole('dialog', { name: '予約' })
      // 今は 9:00。会議室 A の 9:00〜10:30 は埋まっているので、最初の空きは 10:30
      expect(within(dialog).getByLabelText('会議室')).toHaveValue('10')
      expect(within(dialog).getByLabelText('開始')).toHaveValue('630')
      expect(within(dialog).getByLabelText('終了')).toHaveValue('660')
      expect(within(dialog).getByLabelText('会議室')).toHaveFocus()
      expect(screen.getByText('10:30〜11:00 予約中…')).toHaveClass('draft')
    })

    it('キーボードだけで、選んで予約まで進める', async () => {
      mockApi()
      render(<App now={now} />)
      const button = await screen.findByRole('button', { name: '＋ 予約する' })
      await waitFor(() => expect(button).toBeEnabled())

      button.focus()
      await userEvent.keyboard('{Enter}')
      await userEvent.keyboard('{Tab}{Tab}{Tab}{Tab}') // 会議室 → 日付 → 開始 → 終了 → 用件
      expect(screen.getByLabelText('用件')).toHaveFocus()
      await userEvent.keyboard('打合せ{Enter}')

      expect(await screen.findByRole('status')).toHaveTextContent('予約しました')
      expect(posts).toEqual([
        {
          employeeId: 1,
          roomId: 10,
          startAt: '2026-11-20T09:00:00+09:00',
          endAt: '2026-11-20T09:30:00+09:00',
          purpose: '打合せ',
        },
      ])
    })

    it('今日の受付が終わっているときと、過去の日では、押せない（理由が title に出る）', async () => {
      mockApi()
      render(<App now={() => new Date('2026-11-20T11:30:00Z')} />) // 日本時間 20:30
      const button = await screen.findByRole('button', { name: '＋ 予約する' })
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute('title', '本日の受付は終了しました')

      await userEvent.click(screen.getByRole('button', { name: '前の日' }))
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute('title', '過去の日は予約できません')
    })

    it('次の日に動かすと、その日の最初の空きで開く', async () => {
      mockApi()
      render(<App now={() => new Date('2026-11-20T11:30:00Z')} />)
      await screen.findByRole('button', { name: '＋ 予約する' })
      await userEvent.click(screen.getByRole('button', { name: '次の日' }))
      const button = screen.getByRole('button', { name: '＋ 予約する' })
      await waitFor(() => expect(button).toBeEnabled())

      await userEvent.click(button)
      expect(within(screen.getByRole('dialog', { name: '予約' })).getByLabelText('開始')).toHaveValue('480')
    })
  })

  describe('予約の変更', () => {
    beforeEach(() => vi.spyOn(window, 'confirm').mockReturnValue(true))
    afterEach(() => vi.restoreAllMocks())

    it('予約の内容の［変更する］で、元の値の入った小窓が開き、保存すると PUT で送ってお知らせを出す', async () => {
      let changed = false
      mockApi({
        day: () => json(changed ? [reservation({ roomId: 11, startAt: '2026-11-20T13:00:00+09:00', endAt: '2026-11-20T14:00:00+09:00' })] : [reservation({})]),
        update: () => {
          changed = true
          return json(reservation({ roomId: 11 }))
        },
      })
      render(<App now={now} />)

      await userEvent.click(await screen.findByText('営業定例（田中）'))
      await userEvent.click(within(screen.getByRole('dialog', { name: '予約の内容' })).getByRole('button', { name: '変更する' }))

      const dialog = screen.getByRole('dialog', { name: '予約の変更' })
      expect(within(dialog).getByText('予約を変更する')).toBeInTheDocument()
      expect(within(dialog).getByLabelText('開始')).toHaveValue('600')
      expect(within(dialog).getByLabelText('終了')).toHaveValue('690')
      expect(within(dialog).getByLabelText('用件')).toHaveValue('営業定例')
      // 元の予約の枠は隠れ、点線の仮表示に置き換わる
      expect(screen.queryByText('営業定例（田中）')).not.toBeInTheDocument()
      expect(screen.getByText('10:00〜11:30 予約中…')).toHaveClass('draft')

      await userEvent.selectOptions(within(dialog).getByLabelText('会議室'), '11')
      await userEvent.selectOptions(within(dialog).getByLabelText('開始'), '780')
      await userEvent.selectOptions(within(dialog).getByLabelText('終了'), '840')
      await userEvent.click(within(dialog).getByRole('button', { name: '変更を保存' }))

      expect(await screen.findByRole('status')).toHaveTextContent('予約を変更しました')
      expect(puts).toEqual([
        {
          id: '100',
          body: {
            employeeId: 1,
            roomId: 11,
            startAt: '2026-11-20T13:00:00+09:00',
            endAt: '2026-11-20T14:00:00+09:00',
            purpose: '営業定例',
          },
        },
      ])
      expect(posts).toEqual([])
      expect(screen.queryByRole('dialog', { name: '予約の変更' })).not.toBeInTheDocument()
    })

    it('保存の確認で「キャンセル」を選ぶと、何も送らず、小窓もそのまま', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false)
      mockApi({ day: () => json([reservation({})]) })
      render(<App now={now} />)

      await userEvent.click(await screen.findByText('営業定例（田中）'))
      await userEvent.click(screen.getByRole('button', { name: '変更する' }))
      const dialog = screen.getByRole('dialog', { name: '予約の変更' })
      await userEvent.click(within(dialog).getByRole('button', { name: '変更を保存' }))

      expect(window.confirm).toHaveBeenCalledWith('この内容で予約を変更しますか？')
      expect(puts).toEqual([])
      expect(screen.getByRole('dialog', { name: '予約の変更' })).toBeInTheDocument()
    })

    it('入力に問題があるときは、確認の前にエラーを出す（確認は出さない）', async () => {
      mockApi({ day: () => json([reservation({})]) })
      render(<App now={now} />)

      await userEvent.click(await screen.findByText('営業定例（田中）'))
      await userEvent.click(screen.getByRole('button', { name: '変更する' }))
      const dialog = screen.getByRole('dialog', { name: '予約の変更' })
      fireEvent.change(within(dialog).getByLabelText('日付'), { target: { value: '' } })
      await userEvent.click(within(dialog).getByRole('button', { name: '変更を保存' }))

      expect(within(dialog).getByRole('alert')).toHaveTextContent('日付を選んでください')
      expect(window.confirm).not.toHaveBeenCalled()
    })

    it('自分の古い時間と重なるずらし方は、画面の検査で止めない（API に送る）', async () => {
      mockApi({ day: () => json([reservation({})]) })
      render(<App now={now} />)

      await userEvent.click(await screen.findByText('営業定例（田中）'))
      await userEvent.click(screen.getByRole('button', { name: '変更する' }))
      const dialog = screen.getByRole('dialog', { name: '予約の変更' })
      await userEvent.selectOptions(within(dialog).getByLabelText('開始'), '630') // 10:30〜11:30
      await userEvent.click(within(dialog).getByRole('button', { name: '変更を保存' }))

      await waitFor(() => expect(puts).toHaveLength(1))
    })

    it('変更が 409 で断られたら、小窓に理由を出して開いたままにする', async () => {
      mockApi({
        day: () => json([reservation({})]),
        update: () => json({ message: 'その時間はすでに予約があります' }, 409),
      })
      render(<App now={now} />)

      await userEvent.click(await screen.findByText('営業定例（田中）'))
      await userEvent.click(screen.getByRole('button', { name: '変更する' }))
      const dialog = screen.getByRole('dialog', { name: '予約の変更' })
      await userEvent.click(within(dialog).getByRole('button', { name: '変更を保存' }))

      expect(await within(dialog).findByRole('alert')).toHaveTextContent('その時間はすでに予約があります')
    })

    it('変更の小窓の外側を押すと閉じるだけで、押した下の空き枠は選ばない', async () => {
      mockApi({ day: () => json([reservation({})]) })
      render(<App now={now} />)

      await userEvent.click(await screen.findByText('営業定例（田中）'))
      await userEvent.click(screen.getByRole('button', { name: '変更する' }))
      expect(screen.getByRole('dialog', { name: '予約の変更' })).toBeInTheDocument()

      await userEvent.click(screen.getAllByRole('gridcell', { name: '13:00 空き' })[0])
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument() // 閉じるだけ。予約する小窓は開かない
      expect(puts).toEqual([])
    })

    it('変更で会議室を変えると、小窓が仮表示のある行の近くへ動く', async () => {
      // 行の位置を、行の順番で決めた値にする（jsdom には画面上の位置が無いため）
      const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
        const row = this.closest('tr')
        const top = row ? [...(row.parentElement?.children ?? [])].indexOf(row) * 40 : 0
        return { left: 50, top, bottom: top + 30, right: 100, width: 50, height: 30, x: 50, y: top, toJSON: () => ({}) }
      })
      try {
        mockApi({ day: () => json([reservation({})]) })
        render(<App now={now} />)

        await userEvent.click(await screen.findByText('営業定例（田中）'))
        await userEvent.click(screen.getByRole('button', { name: '変更する' }))
        const dialog = screen.getByRole('dialog', { name: '予約の変更' })
        const before = Number.parseFloat(dialog.style.top)

        await userEvent.selectOptions(within(dialog).getByLabelText('会議室'), '11') // 1 行下の会議室 B
        await waitFor(() => expect(Number.parseFloat(dialog.style.top)).toBe(before + 40))
      } finally {
        spy.mockRestore()
      }
    })

    it('他の人の予約・始まった予約には［変更する］が出ない', async () => {
      mockApi({
        day: () =>
          json([
            reservation({ id: 1, startAt: '2026-11-20T08:30:00+09:00', endAt: '2026-11-20T09:30:00+09:00', purpose: '朝会' }),
            reservation({ id: 2, roomId: 11, employeeId: 2, employeeName: '佐藤架空', purpose: '商談' }),
          ]),
      })
      render(<App now={now} />)

      await userEvent.click(await screen.findByText('朝会（田中）'))
      expect(screen.queryByRole('button', { name: '変更する' })).not.toBeInTheDocument()
      await userEvent.click(screen.getByText('商談（佐藤）'))
      expect(screen.queryByRole('button', { name: '変更する' })).not.toBeInTheDocument()
    })

    it('自分のカードの［変更］で、その予約の変更の小窓が開く（始まった予約には［変更］が無い）', async () => {
      window.scrollTo = vi.fn()
      mockApi({
        day: () => json([reservation({})]),
        upcoming: () =>
          json([
            reservation({ id: 1, startAt: '2026-11-20T08:30:00+09:00', endAt: '2026-11-20T09:30:00+09:00', purpose: '朝会' }),
            reservation({}),
          ]),
      })
      render(<App now={now} />)

      const buttons = await screen.findAllByRole('button', { name: '変更' })
      expect(buttons).toHaveLength(1) // 朝会は進行中
      expect(screen.getByText('進行中')).toBeInTheDocument()

      await userEvent.click(buttons[0])
      const dialog = screen.getByRole('dialog', { name: '予約の変更' })
      expect(within(dialog).getByLabelText('用件')).toHaveValue('営業定例')
    })
  })

  describe('予約のキャンセル', () => {
    afterEach(() => vi.restoreAllMocks())

    it('予約の内容の［キャンセルする］で、確認して OK なら DELETE で送り、小窓を閉じてお知らせを出し、表を読み直す', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      let cancelled = false
      const calls = mockApi({
        day: () => json(cancelled ? [] : [reservation({})]),
        cancel: () => {
          cancelled = true
          return new Response(null, { status: 204 })
        },
      })
      render(<App now={now} />)

      await userEvent.click(await screen.findByText('営業定例（田中）'))
      await userEvent.click(screen.getByRole('button', { name: '予約をキャンセルする' }))

      expect(window.confirm).toHaveBeenCalledWith('この予約をキャンセルしますか？')
      expect(await screen.findByRole('status')).toHaveTextContent('予約をキャンセルしました')
      expect(deletes).toEqual(['/api/reservations/100?employeeId=1'])
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      await waitFor(() => expect(screen.queryByText('営業定例（田中）')).not.toBeInTheDocument())
      expect(calls.filter((u) => u === '/api/reservations?date=2026-11-20').length).toBeGreaterThan(1)
    })

    it('確認で「キャンセル」を選んだら、何も送らず、小窓もそのまま', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false)
      mockApi({ day: () => json([reservation({})]) })
      render(<App now={now} />)

      await userEvent.click(await screen.findByText('営業定例（田中）'))
      await userEvent.click(screen.getByRole('button', { name: '予約をキャンセルする' }))

      expect(deletes).toEqual([])
      expect(screen.getByRole('dialog', { name: '予約の内容' })).toBeInTheDocument()
    })

    it('自分のカードの［キャンセル］でも消せる（始まった予約には出ない）', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      mockApi({
        day: () => json([reservation({})]),
        upcoming: () =>
          json([
            reservation({ id: 1, startAt: '2026-11-20T08:30:00+09:00', endAt: '2026-11-20T09:30:00+09:00', purpose: '朝会' }),
            reservation({}),
          ]),
      })
      render(<App now={now} />)

      const buttons = await screen.findAllByRole('button', { name: '予約をキャンセル' })
      expect(buttons).toHaveLength(1) // 朝会は進行中
      await userEvent.click(buttons[0])

      expect(await screen.findByRole('status')).toHaveTextContent('予約をキャンセルしました')
      expect(deletes).toEqual(['/api/reservations/100?employeeId=1'])
    })

    it('断られたら、小窓を閉じて（古い内容で操作させない）、理由をお知らせに出す', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      mockApi({
        day: () => json([reservation({})]),
        cancel: () => json({ message: '予約が見つかりません' }, 404),
      })
      render(<App now={now} />)

      await userEvent.click(await screen.findByText('営業定例（田中）'))
      await userEvent.click(screen.getByRole('button', { name: '予約をキャンセルする' }))

      expect(await screen.findByRole('status')).toHaveTextContent('予約が見つかりません')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('通信中に続けて押しても、送るのは 1 回だけで、成功のお知らせが上書きされない', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      let count = 0
      mockApi({
        day: () => json([reservation({})]),
        upcoming: () => json([reservation({})]),
        cancel: () => {
          count += 1
          return count === 1 ? new Response(null, { status: 204 }) : json({ message: '予約が見つかりません' }, 404)
        },
      })
      render(<App now={now} />)

      const button = await screen.findByRole('button', { name: '予約をキャンセル' })
      fireEvent.click(button)
      fireEvent.click(button) // 返事を待たずに、もう一度
      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('予約をキャンセルしました'))
      expect(deletes).toHaveLength(1)
    })

    it('別の予約のキャンセルでは、開いている小窓を閉じない', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      mockApi({
        day: () => json([reservation({ id: 1, purpose: '朝会', startAt: '2026-11-20T09:30:00+09:00', endAt: '2026-11-20T10:00:00+09:00' }), reservation({})]),
        upcoming: () => json([reservation({ id: 1, purpose: '朝会', startAt: '2026-11-20T09:30:00+09:00', endAt: '2026-11-20T10:00:00+09:00' })]),
      })
      render(<App now={now} />)

      await userEvent.click(await screen.findByText('営業定例（田中）')) // 100 の内容の小窓
      await userEvent.click(screen.getByRole('button', { name: '予約をキャンセル' })) // カードは 1（朝会）
      await screen.findByRole('status')
      expect(deletes).toEqual(['/api/reservations/1?employeeId=1'])
      expect(screen.getByRole('dialog', { name: '予約の内容' })).toBeInTheDocument()
    })

    it('断られたら、理由をお知らせに出す', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      mockApi({
        day: () => json([reservation({})]),
        cancel: () => json({ message: '始まった予約はキャンセルできません' }, 400),
      })
      render(<App now={now} />)

      await userEvent.click(await screen.findByText('営業定例（田中）'))
      await userEvent.click(screen.getByRole('button', { name: '予約をキャンセルする' }))

      expect(await screen.findByRole('status')).toHaveTextContent('始まった予約はキャンセルできません')
    })

    it('他の人の予約・始まった予約には［キャンセルする］が出ない', async () => {
      mockApi({
        day: () =>
          json([
            reservation({ id: 1, startAt: '2026-11-20T08:30:00+09:00', endAt: '2026-11-20T09:30:00+09:00', purpose: '朝会' }),
            reservation({ id: 2, roomId: 11, employeeId: 2, employeeName: '佐藤架空', purpose: '商談' }),
          ]),
      })
      render(<App now={now} />)

      await userEvent.click(await screen.findByText('朝会（田中）'))
      expect(screen.queryByRole('button', { name: '予約をキャンセルする' })).not.toBeInTheDocument()
      await userEvent.click(screen.getByText('商談（佐藤）'))
      expect(screen.queryByRole('button', { name: '予約をキャンセルする' })).not.toBeInTheDocument()
    })
  })
})
