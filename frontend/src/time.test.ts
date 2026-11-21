import { describe, expect, it } from 'vitest'
import {
  addDays,
  calendarDays,
  dateOf,
  earliestStart,
  formatDateLabel,
  formatMinutes,
  formatShortDate,
  isFinished,
  isStarted,
  minutesInTokyo,
  minutesOf,
  todayInTokyo,
} from './time'

describe('time', () => {
  it('日本時間の今日と時刻を返す（世界時の前日 16:30 は日本時間の 1:30）', () => {
    const now = new Date('2026-11-20T16:30:00Z')
    expect(todayInTokyo(now)).toBe('2026-11-21')
    expect(minutesInTokyo(now)).toBe(90)
  })

  it('日付を足し引きする（月・年をまたぐ）', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('日付を曜日つきで表す', () => {
    expect(formatDateLabel('2026-11-21')).toBe('2026年11月21日（土）')
  })

  it('API の日時から日付と分を取り出す', () => {
    expect(dateOf('2026-11-20T10:30:00+09:00')).toBe('2026-11-20')
    expect(minutesOf('2026-11-20T10:30:00+09:00')).toBe(630)
  })

  it('分を時刻の文字にする', () => {
    expect(formatMinutes(480)).toBe('8:00')
    expect(formatMinutes(630)).toBe('10:30')
  })

  it('日付を短く表す', () => {
    expect(formatShortDate('2026-11-20')).toBe('11/20(金)')
  })

  it('予約を始められる最も早い時刻（今日は 30 分単位で切り上げ）', () => {
    expect(earliestStart('2026-11-20', '2026-11-20', 9 * 60 + 1)).toBe(9 * 60 + 30)
    expect(earliestStart('2026-11-20', '2026-11-20', 9 * 60)).toBe(9 * 60)
    expect(earliestStart('2026-11-21', '2026-11-20', 9 * 60)).toBe(0)
    expect(earliestStart('2026-11-19', '2026-11-20', 9 * 60)).toBe(Infinity)
  })

  it('予約が終わっているか・始まっているか', () => {
    // 今日 9:00
    expect(isFinished('2026-11-20', 9 * 60, '2026-11-20', 9 * 60)).toBe(true) // 終了 = 今 は終わり
    expect(isFinished('2026-11-20', 9 * 60 + 30, '2026-11-20', 9 * 60)).toBe(false)
    expect(isFinished('2026-11-19', 20 * 60, '2026-11-20', 9 * 60)).toBe(true)
    expect(isStarted('2026-11-20', 9 * 60, '2026-11-20', 9 * 60)).toBe(true) // 開始 = 今 は始まり
    expect(isStarted('2026-11-20', 9 * 60 + 30, '2026-11-20', 9 * 60)).toBe(false)
    expect(isStarted('2026-11-21', 8 * 60, '2026-11-20', 9 * 60)).toBe(false)
  })

  it('カレンダーは、その月を含む 6 週間（日曜始まり・42 日）を返す', () => {
    const days = calendarDays(2026, 11) // 2026-11-01 は日曜
    expect(days).toHaveLength(42)
    expect(days[0]).toBe('2026-11-01')
    expect(days[41]).toBe('2026-12-12')
    expect(calendarDays(2026, 12)[0]).toBe('2026-11-29') // 12/1 は火曜 → 前の日曜から
  })
})
