// API（/api/...）を呼ぶ関数と、返ってくるデータの型。型は API の返事（backend の Response）と同じ形にしている。

export type Employee = { id: number; name: string }

export type Room = { id: number; name: string; capacity: number }

export type Reservation = {
  id: number
  roomId: number
  employeeId: number
  employeeName: string
  startAt: string // "2026-11-20T10:00:00+09:00"（日本時間）
  endAt: string
  purpose: string | null
}

/** 画面にそのまま出せるメッセージを持つエラー。 */
export class ApiError extends Error {}

async function getJson<T>(url: string): Promise<T> {
  return requestJson<T>(url)
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, init)
  } catch {
    throw new ApiError('サーバーにつながりません。しばらくしてからもう一度お試しください。')
  }
  if (!response.ok) {
    throw new ApiError(await messageOf(response))
  }
  return (await response.json()) as T
}

/** 失敗の返事は {"message": "..."} の形。読めないときは決まった文を返す。 */
async function messageOf(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown }
    if (typeof body.message === 'string' && body.message !== '') {
      return body.message
    }
  } catch {
    // 返事が JSON でないとき（API が止まっているときなど）は下の文にする
  }
  return 'エラーが起きました。しばらくしてからもう一度お試しください。'
}

/** 予約を作るときに送る内容。日時は +09:00 つき（"2026-11-20T10:00:00+09:00"） */
export type NewReservation = {
  employeeId: number
  roomId: number
  startAt: string
  endAt: string
  purpose: string | null
}

/** 予約を作る。失敗したら、API のメッセージを持つ ApiError を投げる（400・404・409 など）。 */
export const createReservation = (input: NewReservation) =>
  requestJson<Reservation>('/api/reservations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

export const fetchEmployees = () => getJson<Employee[]>('/api/employees')

export const fetchRooms = () => getJson<Room[]>('/api/rooms')

/** その日の全予約 */
export const fetchReservations = (date: string) =>
  getJson<Reservation[]>(`/api/reservations?date=${encodeURIComponent(date)}`)

/** 予約がある日と、予約した社員の番号（カレンダーの点用） */
export type DayReservations = { date: string; employeeIds: number[] }

/** "2026-11-01~2026-12-12" の形（from~to、両端を含む）の期間で、予約がある日を調べる */
export const fetchReservationDays = (range: string) => {
  const [from, to] = range.split('~')
  return getJson<DayReservations[]>(`/api/reservation-days?from=${from}&to=${to}`)
}

/** その社員の、今から先（進行中を含む）の予約 */
export const fetchUpcoming = (employeeId: number) =>
  getJson<Reservation[]>(`/api/reservations?employeeId=${employeeId}`)
