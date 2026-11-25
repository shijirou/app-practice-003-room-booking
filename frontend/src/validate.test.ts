import { describe, expect, it } from 'vitest'
import type { Reservation } from './api'
import { isoOf } from './time'
import { cleanPurpose, defaultEnd, firstFreeSlot, selfOverlaps, validateForm, type Form } from './validate'

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

describe('cleanPurpose（API の ReservationRules.cleanPurpose と同じ定義）', () => {
  it('前後の見えない文字（空白・改行・ゼロ幅スペース・BOM・ノーブレークスペース）を除く', () => {
    expect(cleanPurpose('  定例 ')).toBe('定例')
    expect(cleanPurpose('​定例﻿')).toBe('定例')
    expect(cleanPurpose('\n\t定例 ')).toBe('定例')
    expect(cleanPurpose('　定例　')).toBe('定例') // 全角スペース
  })

  it('見えない文字だけなら空になる（用件なし）。途中の文字は残す', () => {
    expect(cleanPurpose('​')).toBe('')
    expect(cleanPurpose('​﻿  \n\t')).toBe('')
    expect(cleanPurpose('a b')).toBe('a b')
    expect(cleanPurpose('a​b')).toBe('a​b') // 途中のゼロ幅スペースは、API も取らない
  })
})

describe('validateForm（API と同じ決まり）', () => {
  it('用件の途中に改行・タブがあると断る。前後の改行は除かれるので通る', () => {
    expect(validateForm(form({ purpose: '1行目\n2行目' }), context)).toBe('用件に改行やタブは使えません')
    expect(validateForm(form({ purpose: 'a\tb' }), context)).toBe('用件に改行やタブは使えません')
    expect(validateForm(form({ purpose: '\n定例\n' }), context)).toBeNull()
    expect(validateForm(form({ purpose: '​' }), context)).toBeNull() // 用件なしとして通る
  })

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

describe('selfOverlaps（自分の別の会議室の予約との重なり）', () => {
  const mine = { ...reservation(11, '10:30', '11:30'), id: 5 } // 自分（社員 1）・会議室 11
  const theirs = { ...reservation(11, '10:30', '11:30'), id: 6, employeeId: 2 }

  it('自分の別の会議室の予約と時間が重なると返す', () => {
    expect(selfOverlaps(form(), [mine], 1)).toEqual([mine])
  })
  it('接しているだけ・ほかの人の予約・同じ会議室・自分が不明・まだ読み込んでいないときは、返さない', () => {
    expect(selfOverlaps(form({ end: 10 * 60 + 30 }), [mine], 1)).toEqual([]) // 10:00〜10:30 と 10:30〜 は接するだけ
    expect(selfOverlaps(form(), [theirs], 1)).toEqual([])
    expect(selfOverlaps(form({ roomId: 11 }), [mine], 1)).toEqual([]) // 同じ会議室は、別の検査（禁止）が扱う
    expect(selfOverlaps(form(), [mine], null)).toEqual([])
    expect(selfOverlaps(form(), null, 1)).toEqual([])
  })
  it('変更中の元の予約自体は比べない', () => {
    expect(selfOverlaps(form(), [mine], 1, 5)).toEqual([])
    expect(selfOverlaps(form(), [mine], 1, 99)).toEqual([mine]) // 別の予約を変更中なら比べる
  })
})

describe('defaultEnd', () => {
  it('30 分（1 枠）。閉館は越えない', () => {
    expect(defaultEnd(10 * 60)).toBe(10 * 60 + 30)
    expect(defaultEnd(19 * 60 + 30)).toBe(20 * 60)
  })
})

describe('isoOf', () => {
  it('日付と分から、API に送る日時にする', () => {
    expect(isoOf('2026-11-20', 10 * 60 + 30)).toBe('2026-11-20T10:30:00+09:00')
    expect(isoOf('2026-11-20', 8 * 60)).toBe('2026-11-20T08:00:00+09:00')
  })
})

describe('firstFreeSlot', () => {
  const rooms = [
    { id: 10, name: '会議室A', capacity: 4 },
    { id: 11, name: '会議室B', capacity: 6 },
  ]

  it('予約がなければ、最初の会議室の、始められる最も早い時刻', () => {
    expect(firstFreeSlot(rooms, [], 0)).toEqual({ roomId: 10, start: 8 * 60 })
    expect(firstFreeSlot(rooms, [], 9 * 60 + 30)).toEqual({ roomId: 10, start: 9 * 60 + 30 })
  })

  it('最初の会議室の最初の空きを返す（予約の後ろ。隣り合う枠は空き）', () => {
    const day = [reservation(10, '08:00', '09:30')]
    expect(firstFreeSlot(rooms, day, 0)).toEqual({ roomId: 10, start: 9 * 60 + 30 })
  })

  it('最初の会議室が一日中埋まっていれば、次の会議室', () => {
    const day = [reservation(10, '08:00', '14:00'), reservation(10, '14:00', '20:00')]
    expect(firstFreeSlot(rooms, day, 0)).toEqual({ roomId: 11, start: 8 * 60 })
  })

  it('どこも空いていなければ、最初の会議室の最初の時刻（送るときに重なりが分かる）', () => {
    const day = [reservation(10, '08:00', '20:00'), reservation(11, '08:00', '20:00')]
    expect(firstFreeSlot(rooms, day, 0)).toEqual({ roomId: 10, start: 8 * 60 })
  })

  it('受付が終わっている（最後の枠を過ぎた）か、会議室がなければ null', () => {
    expect(firstFreeSlot(rooms, [], 20 * 60)).toBeNull()
    expect(firstFreeSlot([], [], 0)).toBeNull()
  })
})
