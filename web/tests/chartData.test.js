import { describe, it, expect } from 'vitest'
import {
  toCandles, toVolumeBars, toLine, toHistogram, coverage,
  UP_COLOR, DOWN_COLOR, FLAT_COLOR
} from '../src/lib/chartData.js'

const rows = [
  { date: '2025-09-17', open: 1290, high: 1300, low: 1285, close: 1295, volume: 20000000 },
  { date: '2025-09-18', open: 1295, high: 1298, low: 1270, close: 1275, volume: 30000000 },
  { date: '2025-09-19', open: 1300, high: 1310, low: 1295, close: 1305, volume: 31578000 }
]

describe('toCandles', () => {
  it('轉成 lightweight-charts 的 K 線格式', () => {
    expect(toCandles(rows)[2]).toEqual({
      time: '2025-09-19', open: 1300, high: 1310, low: 1295, close: 1305
    })
  })

  it('開高低收有缺值的那筆直接跳過，不補值', () => {
    const out = toCandles([...rows, { date: '2025-09-22', open: 1, high: 2, low: 3, close: null }])
    expect(out).toHaveLength(3)
  })

  it('沒有日期的跳過', () => {
    expect(toCandles([{ open: 1, high: 2, low: 0.5, close: 1.5 }])).toHaveLength(0)
  })
})

describe('toVolumeBars', () => {
  it('收盤高於開盤是紅色（台股習慣紅漲）', () => {
    expect(toVolumeBars(rows)[0].color).toBe(UP_COLOR)
  })

  it('收盤低於開盤是綠色', () => {
    expect(toVolumeBars(rows)[1].color).toBe(DOWN_COLOR)
  })

  it('平盤（收等於開）也算紅', () => {
    expect(toVolumeBars([{ date: 'd', open: 10, close: 10, volume: 1 }])[0].color).toBe(UP_COLOR)
  })

  it('缺開盤或收盤時用中性色，不亂猜方向', () => {
    expect(toVolumeBars([{ date: 'd', volume: 1 }])[0].color).toBe(FLAT_COLOR)
  })

  it('成交量維持「股」，不在這裡換算成張', () => {
    expect(toVolumeBars(rows)[2].value).toBe(31578000)
  })
})

describe('toLine', () => {
  const dates = ['2025-09-17', '2025-09-18', '2025-09-19']

  it('null 的點直接略過，不補 0 也不補前值', () => {
    expect(toLine(dates, [null, null, 55])).toEqual([{ time: '2025-09-19', value: 55 }])
  })

  it('中間有 null 時線會斷開，而不是被填平', () => {
    expect(toLine(dates, [1, null, 3])).toEqual([
      { time: '2025-09-17', value: 1 },
      { time: '2025-09-19', value: 3 }
    ])
  })

  it('0 是有效數值，不會被當成資料不足', () => {
    expect(toLine(dates, [0, null, 0])).toHaveLength(2)
  })

  it('長度不一致會丟錯', () => {
    expect(() => toLine(dates, [1, 2])).toThrow(TypeError)
  })
})

describe('toHistogram', () => {
  it('正值紅、負值綠', () => {
    const out = toHistogram(['a', 'b'], [1.5, -2.5])
    expect(out[0].color).toBe(UP_COLOR)
    expect(out[1].color).toBe(DOWN_COLOR)
  })

  it('0 算正值', () => {
    expect(toHistogram(['a'], [0])[0].color).toBe(UP_COLOR)
  })
})

describe('coverage', () => {
  it('算出有幾筆有值、幾筆資料不足', () => {
    expect(coverage([1, null, 3, null, 5])).toEqual({
      total: 5, present: 3, missing: 2, ratio: 0.6
    })
  })

  it('空陣列的比例是 null，不是 0（避免顯示成 0%）', () => {
    expect(coverage([])).toEqual({ total: 0, present: 0, missing: 0, ratio: null })
  })
})
