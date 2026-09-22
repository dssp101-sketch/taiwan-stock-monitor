import { describe, it, expect } from 'vitest'
import { isTradedRow, cleanDailyPrices, toSeries } from '../src/lib/priceSeries.js'

const traded = { date: '2025-09-19', open: 1300, high: 1310, low: 1295, close: 1305, volume: 31578000 }
const noTrade = { date: '2025-09-18', open: 0, high: 0, low: 0, close: 0, volume: 0 }

describe('isTradedRow', () => {
  it('正常交易日通過', () => {
    expect(isTradedRow(traded)).toBe(true)
  })

  it('無成交日（開高低收為 0）不通過', () => {
    expect(isTradedRow(noTrade)).toBe(false)
  })

  it('只要有一個價格欄位是 0 就不通過', () => {
    expect(isTradedRow({ ...traded, close: 0 })).toBe(false)
    expect(isTradedRow({ ...traded, low: 0 })).toBe(false)
  })

  it('null、負數、字串都不通過', () => {
    expect(isTradedRow({ ...traded, close: null })).toBe(false)
    expect(isTradedRow({ ...traded, close: -1 })).toBe(false)
    expect(isTradedRow({ ...traded, close: '1305' })).toBe(false)
    expect(isTradedRow(null)).toBe(false)
  })

  it('成交量為 0 但有價格時仍算有效（可能是零股或極冷門股）', () => {
    expect(isTradedRow({ ...traded, volume: 0 })).toBe(true)
  })
})

describe('cleanDailyPrices', () => {
  it('濾掉無成交日，並誠實回報排除了幾筆', () => {
    const { rows, excluded } = cleanDailyPrices([traded, noTrade])
    expect(rows).toHaveLength(1)
    expect(rows[0].date).toBe('2025-09-19')
    expect(excluded).toBe(1)
  })

  it('依日期由舊到新排序', () => {
    const a = { ...traded, date: '2025-09-19' }
    const b = { ...traded, date: '2025-01-02' }
    const c = { ...traded, date: '2025-05-06' }
    const { rows } = cleanDailyPrices([a, b, c])
    expect(rows.map((r) => r.date)).toEqual(['2025-01-02', '2025-05-06', '2025-09-19'])
  })

  it('全部都是無成交日時回傳空陣列，不回傳假資料', () => {
    const { rows, excluded } = cleanDailyPrices([noTrade, noTrade])
    expect(rows).toEqual([])
    expect(excluded).toBe(2)
  })
})

describe('toSeries', () => {
  it('抽出各欄位數列供指標使用', () => {
    const { rows } = cleanDailyPrices([traded])
    const s = toSeries(rows)
    expect(s.closes).toEqual([1305])
    expect(s.highs).toEqual([1310])
    expect(s.volumes).toEqual([31578000])
    expect(s.dates).toEqual(['2025-09-19'])
  })
})
