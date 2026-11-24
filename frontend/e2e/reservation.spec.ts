import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

// 予約の通しテスト。「明日」の予約を使う（今日だと、現在時刻で空き枠が変わってしまうため）。
// 社員・会議室は、API の起動時に Flyway が入れる架空のサンプルデータ。

type Employee = { id: number; name: string }
type Room = { id: number; name: string }
type Reservation = { id: number; employeeId: number }

const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date(Date.now() + 24 * 60 * 60 * 1000))

const iso = (hhmm: string) => `${tomorrow}T${hhmm}:00+09:00`

async function employeeByName(request: APIRequestContext, name: string): Promise<Employee> {
  const list = (await (await request.get('/api/employees')).json()) as Employee[]
  const found = list.find((e) => e.name === name)
  if (!found) throw new Error(`社員が見つかりません: ${name}`)
  return found
}

async function roomByName(request: APIRequestContext, name: string): Promise<Room> {
  const list = (await (await request.get('/api/rooms')).json()) as Room[]
  const found = list.find((r) => r.name === name)
  if (!found) throw new Error(`会議室が見つかりません: ${name}`)
  return found
}

/** 画面を通さず、API で予約を直接入れる（ほかの人の予約や、ぎりぎりの重なりを作るため） */
async function seed(request: APIRequestContext, who: string, room: string, from: string, to: string, purpose: string) {
  const res = await request.post('/api/reservations', {
    data: {
      employeeId: (await employeeByName(request, who)).id,
      roomId: (await roomByName(request, room)).id,
      startAt: iso(from),
      endAt: iso(to),
      purpose,
    },
  })
  expect(res.status()).toBe(201)
}

/** 明日の予約をすべて消して、テストごとに同じ状態から始める */
async function clearTomorrow(request: APIRequestContext) {
  const list = (await (await request.get(`/api/reservations?date=${tomorrow}`)).json()) as Reservation[]
  for (const r of list) {
    await request.delete(`/api/reservations/${r.id}?employeeId=${r.employeeId}`)
  }
}

/** 画面を開き、社員を選んで、明日の表を出す */
async function openAs(page: Page, who: string) {
  await page.goto('/')
  await page.getByLabel('ログイン中（仮）').selectOption({ label: who })
  await page.getByRole('button', { name: '次の日' }).click()
  await expect(page.getByTestId('free').first()).toBeVisible()
}

/** 画面内の確認ダイアログ（alertdialog）の中のボタンを押して、答える */
const answer = (page: Page, name: string) => page.getByRole('alertdialog').getByRole('button', { name }).click()

const rowOf = (page: Page, room: string) =>
  page.locator('tr').filter({ has: page.locator('th.room', { hasText: room }) })

test.beforeEach(async ({ request }) => {
  await clearTomorrow(request)
})

test('予約 → 変更 → キャンセルを通しでできる', async ({ page }) => {
  await openAs(page, '田中架空')

  // 予約: 会議室A の 10:00 の空き枠を押す（30 分）
  await rowOf(page, '会議室A').getByLabel('10:00 空き').click()
  const form = page.getByRole('dialog', { name: '予約', exact: true })
  await form.getByLabel('用件').fill('週次の打ち合わせ')
  await form.getByRole('button', { name: '予約する' }).click()
  await expect(page.getByText('予約しました')).toBeVisible()
  const mine = rowOf(page, '会議室A').getByTestId('reservation')
  await expect(mine).toContainText('週次の打ち合わせ')
  await expect(mine).toHaveClass(/mine/)

  // 変更: 終了を 11:00 にのばす
  await mine.click()
  await page.getByRole('dialog', { name: '予約の内容' }).getByRole('button', { name: '変更する' }).click()
  const edit = page.getByRole('dialog', { name: '予約の変更' })
  await edit.getByLabel('終了').selectOption({ label: '11:00' })
  await expect(page.getByTestId('draft')).toContainText('10:00〜11:00')
  await edit.getByRole('button', { name: '変更を保存' }).click()
  await expect(page.getByRole('alertdialog')).toContainText('この内容で予約を変更しますか？')
  await answer(page, '変更する')
  await expect(page.getByText('予約を変更しました')).toBeVisible()
  await expect(mine).toHaveAttribute('data-to', String(11 * 60))

  // キャンセル: 確認で OK を押す
  await mine.click()
  await page.getByRole('dialog', { name: '予約の内容' }).getByRole('button', { name: '予約をキャンセルする' }).click()
  await expect(page.getByRole('alertdialog')).toContainText('この予約をキャンセルしますか？')
  await answer(page, '予約をキャンセルする')
  await expect(page.getByText('予約をキャンセルしました')).toBeVisible()
  await expect(rowOf(page, '会議室A').getByTestId('reservation')).toHaveCount(0)
})

test('キャンセルの確認で「戻る」を選ぶと、予約は残る', async ({ page, request }) => {
  await seed(request, '田中架空', '会議室B', '13:00', '14:00', '残る予約')
  await openAs(page, '田中架空')

  await rowOf(page, '会議室B').getByTestId('reservation').click()
  await page.getByRole('dialog', { name: '予約の内容' }).getByRole('button', { name: '予約をキャンセルする' }).click()
  await answer(page, '戻る')
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(rowOf(page, '会議室B').getByTestId('reservation')).toHaveCount(1)
})

test('同じ枠を同時に取ろうとすると 409 で断られ、画面にメッセージが出る', async ({ page, request }) => {
  await openAs(page, '田中架空')

  // 田中さんが 11:00 の枠で小窓を開いている間に、佐藤さんが同じ枠を先に取る
  await rowOf(page, '会議室A').getByLabel('11:00 空き').click()
  const form = page.getByRole('dialog', { name: '予約', exact: true })
  await expect(form).toBeVisible()
  await seed(request, '佐藤架空', '会議室A', '11:00', '11:30', '先に取られた')

  const responsePromise = page.waitForResponse((r) => r.url().includes('/api/reservations') && r.request().method() === 'POST')
  await form.getByRole('button', { name: '予約する' }).click()
  expect((await responsePromise).status()).toBe(409)
  await expect(form.getByRole('alert')).toBeVisible()
  // 田中さんの予約は作られていない
  await expect(page.locator('[data-testid="reservation"].mine')).toHaveCount(0)
})

test('ほかの人の予約には、変更・キャンセルのボタンが出ない', async ({ page, request }) => {
  await seed(request, '佐藤架空', '会議室C', '15:00', '16:00', '佐藤の予約')
  await openAs(page, '田中架空')

  const theirs = rowOf(page, '会議室C').getByTestId('reservation')
  await expect(theirs).toHaveClass(/busy/)
  await theirs.click()
  const view = page.getByRole('dialog', { name: '予約の内容' })
  await expect(view).toContainText('他の人の予約は変更できません。')
  await expect(view.getByRole('button', { name: '変更する' })).toHaveCount(0)
  await expect(view.getByRole('button', { name: '予約をキャンセルする' })).toHaveCount(0)

  // 予約者本人に切り替えると、同じ予約に［変更する］が出る
  await page.getByLabel('ログイン中（仮）').selectOption({ label: '佐藤架空' })
  await rowOf(page, '会議室C').getByTestId('reservation').click()
  await expect(page.getByRole('dialog', { name: '予約の内容' }).getByRole('button', { name: '変更する' })).toBeVisible()
})

test('自分の別の会議室の予約と重なると、注意文と確認が出る（同じ会議室の重複は 409 のまま）', async ({ page, request }) => {
  await seed(request, '田中架空', '会議室B', '10:00', '11:00', '営業定例')
  await openAs(page, '田中架空')

  await rowOf(page, '会議室A').getByLabel('10:00 空き').click()
  const form = page.getByRole('dialog', { name: '予約', exact: true })
  const warning = form.getByRole('status')
  await expect(warning).toContainText('この時間は、自分の別の予約と重なっています')
  await expect(warning).toContainText('会議室B 10:00〜11:00「営業定例」')

  // 確認で「戻る」: 送らない
  await form.getByRole('button', { name: '予約する' }).click()
  await expect(page.getByRole('alertdialog')).toContainText('重ねて予約しますか？')
  await answer(page, '戻る')
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(page.locator('[data-testid="reservation"]')).toHaveCount(1)

  // 確認で「重ねて予約する」: 予約できる（禁止ではなく、警告と確認だけ）
  await form.getByRole('button', { name: '予約する' }).click()
  await answer(page, '重ねて予約する')
  await expect(page.getByText('予約しました')).toBeVisible()
  await expect(page.locator('[data-testid="reservation"].mine')).toHaveCount(2)
})

test('キーボードだけで予約できる（［＋ 予約する］ボタン）', async ({ page }) => {
  await openAs(page, '田中架空')

  await page.getByRole('button', { name: '＋ 予約する' }).focus()
  await page.keyboard.press('Enter')
  const form = page.getByRole('dialog', { name: '予約', exact: true })
  await expect(form.getByLabel('会議室')).toBeFocused()

  await form.getByLabel('用件').focus()
  await page.keyboard.type('キーボードで予約')
  await page.keyboard.press('Enter')
  await expect(page.getByText('予約しました')).toBeVisible()
  await expect(page.locator('[data-testid="reservation"].mine')).toContainText('キーボードで予約')
})

test('キーボードだけで予約できる（表の中を矢印キーで動く）', async ({ page }) => {
  await openAs(page, '田中架空')

  // 表の最初の空きマスに入り、→ で 1 つ動いて、Enter で小窓を開く
  await rowOf(page, '会議室A').getByLabel('8:00 空き', { exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  const form = page.getByRole('dialog', { name: '予約', exact: true })
  await expect(form).toBeVisible()
  await expect(form.getByLabel('開始')).toHaveValue(String(8 * 60 + 30))

  await form.getByLabel('用件').focus()
  await page.keyboard.type('矢印キーで予約')
  await page.keyboard.press('Enter')
  await expect(page.getByText('予約しました')).toBeVisible()
  await expect(rowOf(page, '会議室A').getByTestId('reservation')).toContainText('矢印キーで予約')
})

test('ミニカレンダーは、今日以外を選んで現在時刻の枠が伸びても、横に伸びない', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /^20\d\d年/ }).click()
  const calendar = page.getByRole('dialog', { name: 'カレンダー' })

  // 「現在 ○:○○」だけの枠の右端（枠の右の余白と線の分を足す）と、カレンダーの右端・幅
  const measure = () =>
    page.evaluate(() => {
      const cal = document.querySelector('.cal')!.getBoundingClientRect()
      const clock = document.querySelector('.clock')!
      const style = getComputedStyle(clock)
      const base = clock.firstElementChild!.getBoundingClientRect()
      return {
        calWidth: cal.width,
        calRight: cal.right,
        baseRight: base.right + parseFloat(style.paddingRight) + parseFloat(style.borderRightWidth),
        clockWidth: clock.getBoundingClientRect().width,
      }
    })

  const onToday = await measure()
  expect(Math.abs(onToday.calRight - onToday.baseRight)).toBeLessThan(2)

  await calendar.locator('.day:not(.today):not(.out)').nth(3).click() // 今日以外を選ぶ
  await expect.poll(async () => (await measure()).clockWidth).toBeGreaterThan(onToday.clockWidth + 50) // 枠は「今日 ○/○」の分だけ伸びる（黄色い枠）

  // カレンダーの右端は、伸びた枠ではなく、「現在 ○:○○」だけの枠の右端に合ったまま。幅も、伸びた分（50px 以上）は増えない
  for (const step of ['選んだ直後', '翌月']) {
    if (step === '翌月') await calendar.getByRole('button', { name: '次の月' }).click()
    const away = await measure()
    expect(Math.abs(away.calRight - away.baseRight), step).toBeLessThan(2)
    expect(Math.abs(away.calWidth - onToday.calWidth), step).toBeLessThan(20)
  }
})
