import { describe, expect, it } from 'vitest'
import type { Reservation } from './api'
import { isoOf } from './time'
import { defaultEnd, validateForm, type Form } from './validate'

const form = (over: Partial<Form> = {}): Form => ({
  roomId: 10,
  date: '2026-11-21',
  start: 10 * 60,
  end: 11 * 60,
  purpose: '',
  ...over,
})
const context = { today: '2026-11-20', nowMinutes: 9 * 60 + 10, existing: null }
const reservation = (roomId: number, start: string, end: string): Reservation => ({
  id: 1,
  roomId,
  employeeId: 1,
  employeeName: '田中架空',
  startAt: `2026-11-21T${start}:00+09:00`,
  endAt: `2026-11-21T${end}:00+09:00`,
  purpose: null,
})

describe('validateForm（API と同じ決まり）', () => {
  it('問題なければ null', () => {
    expect(validateForm(form(), context)).toBeNull()
  })

  it('日付が空・終了が開始以前・時間帯の外', () => {
    expect(validateForm(form({ date: '' }), context)).toBe('日付を選んでください')
    expect(validateForm(form({ end: 10 * 60 }), context)).toBe('終了は開始より後にしてください')
    expect(validateForm(form({ start: 7 * 60 + 30 }), context)).toBe('予約できる時間は 8:00〜20:00 です')
    expect(validateForm(form({ start: 19 * 60, end: 20 * 60 + 30 }), context)).toBe('予約できる時間は 8:00〜20:00 です')
  })

  it('今日は今の時刻を 30 分切り上げた時刻から。別の日が過去なら理由が変わる', () => {
    const today = { date: '2026-11-20' }
    expect(validateForm(form({ ...today, start: 9 * 60 }), context)).toBe('今日は 9:30 以降から予約できます')
    expect(validateForm(form({ ...today, start: 9 * 60 + 30, end: 10 * 60 }), context)).toBeNull()
    expect(validateForm(form({ date: '2026-11-19' }), context)).toBe('過去の時間は予約できません')
  })

  it('90 日先まで・4 時間まで', () => {
    expect(validateForm(form({ date: '2027-02-18' }), context)).toBeNull() // 11/20 + 90 日
    expect(validateForm(form({ date: '2027-02-19' }), context)).toBe('予約できるのは今日から 90 日先までです')
    expect(validateForm(form({ start: 10 * 60, end: 14 * 60 }), context)).toBeNull()
    expect(validateForm(form({ start: 10 * 60, end: 14 * 60 + 30 }), context)).toBe('1 件の予約は 4 時間までです')
  })

  it('同じ会議室で重なるときだけ断る（隣り合う・別の会議室は可。読み込み前は調べない）', () => {
    const existing = [reservation(10, '10:30', '11:30')]
    expect(validateForm(form(), { ...context, existing })).toBe('その時間はすでに予約があります')
    expect(validateForm(form({ start: 9 * 60, end: 10 * 60 + 30 }), { ...context, existing })).toBeNull() // 隣り合う
    expect(validateForm(form({ roomId: 11 }), { ...context, existing })).toBeNull()
    expect(validateForm(form(), context)).toBeNull()
  })
})

describe('defaultEnd', () => {
  it('最大 1 時間。次の予約の開始か閉館までにとどめる', () => {
    expect(defaultEnd(10, 10 * 60, [])).toBe(11 * 60)
    expect(defaultEnd(10, 10 * 60, [reservation(10, '10:30', '11:30')])).toBe(10 * 60 + 30)
    expect(defaultEnd(10, 10 * 60, [reservation(11, '10:30', '11:30')])).toBe(11 * 60) // 別の会議室
    expect(defaultEnd(10, 19 * 60 + 30, [])).toBe(20 * 60) // 閉館まで
  })
})

describe('isoOf', () => {
  it('日付と分から、API に送る日時にする', () => {
    expect(isoOf('2026-11-20', 10 * 60 + 30)).toBe('2026-11-20T10:30:00+09:00')
    expect(isoOf('2026-11-20', 8 * 60)).toBe('2026-11-20T08:00:00+09:00')
  })
})
