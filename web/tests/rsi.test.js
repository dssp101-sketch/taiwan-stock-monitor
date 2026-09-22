import { describe, it, expect } from 'vitest'
import { rsi } from '../src/indicators/rsi.js'

describe('rsi', () => {
  it('手算驗證：[1,2,3,2,3] 的 2 日 RSI', () => {
    // 漲跌：+1, +1, -1, +1
    // 索引2 種子：平均漲 1、平均跌 0        → RSI = 100
    // 索引3：平均漲 (1+0)/2 = 0.5、平均跌 (0+1)/2 = 0.5 → RS = 1 → RSI = 50
    // 索引4：平均漲 (0.5+1)/2 = 0.75、平均跌 (0.5+0)/2 = 0.25 → RS = 3 → RSI = 75
    const out = rsi([1, 2, 3, 2, 3], 2)
    expect(out[0]).toBeNull()
    expect(out[1]).toBeNull()
    expect(out[2]).toBeCloseTo(100, 10)
    expect(out[3]).toBeCloseTo(50, 10)
    expect(out[4]).toBeCloseTo(75, 10)
  })

  it('一路上漲 RSI = 100', () => {
    const out = rsi([1, 2, 3, 4, 5, 6, 7], 3)
    expect(out[3]).toBeCloseTo(100, 10)
    expect(out[6]).toBeCloseTo(100, 10)
  })

  it('一路下跌 RSI = 0', () => {
    const out = rsi([7, 6, 5, 4, 3, 2, 1], 3)
    expect(out[3]).toBeCloseTo(0, 10)
    expect(out[6]).toBeCloseTo(0, 10)
  })

  it('價格完全不動時回傳 50，而不是 100 或 0', () => {
    const out = rsi([5, 5, 5, 5, 5], 2)
    expect(out[2]).toBe(50)
    expect(out[4]).toBe(50)
  })

  it('RSI 永遠落在 0 到 100 之間', () => {
    let seed = 7
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    const values = Array.from({ length: 200 }, () => 100 + rand() * 50)
    for (const v of rsi(values, 14)) {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(100)
      }
    }
  })

  it('第一個值出現在索引 period，之前都是 null', () => {
    const out = rsi([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], 14)
    expect(out.slice(0, 14).every((v) => v === null)).toBe(true)
    expect(out[14]).not.toBeNull()
  })
})
