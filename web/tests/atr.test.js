import { describe, it, expect } from 'vitest'
import { atr, trueRange } from '../src/indicators/atr.js'

const highs = [10, 12, 13, 11]
const lows = [8, 9, 10, 7]
const closes = [9, 11, 12, 8]

describe('trueRange', () => {
  it('手算驗證三種取法都會被考慮到', () => {
    // 索引0：沒有前一日收盤 → null
    // 索引1：max(12−9=3, |12−9|=3, |9−9|=0) = 3
    // 索引2：max(13−10=3, |13−11|=2, |10−11|=1) = 3
    // 索引3：max(11−7=4, |11−12|=1, |7−12|=5) = 5  ← 跳空下跌，靠第三項才抓得到
    expect(trueRange(highs, lows, closes)).toEqual([null, 3, 3, 5])
  })

  it('第一筆沒有前一日收盤價，回傳 null 而不是用高減低硬湊', () => {
    expect(trueRange([10], [8], [9])[0]).toBeNull()
  })
})

describe('atr', () => {
  it('手算驗證：2 日 ATR 的 Wilder 平滑', () => {
    // TR = [null, 3, 3, 5]
    // 索引2 種子 = (3+3)/2 = 3
    // 索引3 = (3×1 + 5)/2 = 4
    expect(atr(highs, lows, closes, 2)).toEqual([null, null, 3, 4])
  })

  it('波幅固定時 ATR 等於該波幅', () => {
    const h = [10, 10, 10, 10, 10]
    const l = [8, 8, 8, 8, 8]
    const c = [9, 9, 9, 9, 9]
    const out = atr(h, l, c, 2)
    expect(out[2]).toBeCloseTo(2, 10)
    expect(out[4]).toBeCloseTo(2, 10)
  })

  it('ATR 永遠非負', () => {
    let seed = 5
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    const c = Array.from({ length: 100 }, () => 100 + rand() * 30)
    const h = c.map((x) => x + rand() * 2)
    const l = c.map((x) => x - rand() * 2)
    for (const v of atr(h, l, c, 14)) {
      if (v !== null) expect(v).toBeGreaterThanOrEqual(0)
    }
  })

  it('資料不足時回傳 null', () => {
    expect(atr(highs, lows, closes, 14)).toEqual([null, null, null, null])
  })
})
