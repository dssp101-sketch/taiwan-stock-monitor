import { describe, it, expect } from 'vitest'
import { sma } from '../src/indicators/sma.js'

describe('sma', () => {
  it('手算驗證：[1,2,3,4,5] 的 3 日均線是 [_,_,2,3,4]', () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4])
  })

  it('週期等於資料長度時只有最後一筆有值', () => {
    expect(sma([10, 20, 30], 3)).toEqual([null, null, 20])
  })

  it('資料不足時整條都是 null，不用 0 填補', () => {
    expect(sma([1, 2], 5)).toEqual([null, null])
  })

  it('視窗內含髒資料時該筆為 null，離開視窗後自動恢復', () => {
    // 索引 2 是髒的，3 日視窗涵蓋索引 2、3、4，所以 2~4 都算不出來
    const out = sma([1, 2, null, 4, 5, 6, 7], 3)
    expect(out).toEqual([null, null, null, null, null, 5, 6])
  })

  it('與逐一重算的結果完全一致（抓遞增加總的累積誤差與扣除錯誤）', () => {
    const naive = (values, period) =>
      values.map((_, i) => {
        if (i < period - 1) return null
        const win = values.slice(i - period + 1, i + 1)
        if (win.some((v) => typeof v !== 'number' || !Number.isFinite(v))) return null
        return win.reduce((a, b) => a + b, 0) / period
      })

    // 固定種子的偽隨機，讓測試可重現
    let seed = 42
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    const values = Array.from({ length: 300 }, (_, i) =>
      i % 37 === 0 ? null : Math.round(rand() * 100000) / 100
    )

    for (const period of [2, 5, 20, 60]) {
      const fast = sma(values, period)
      const slow = naive(values, period)
      fast.forEach((v, i) => {
        if (v === null || slow[i] === null) expect(v).toBe(slow[i])
        else expect(v).toBeCloseTo(slow[i], 8)
      })
    }
  })

  it('參數錯誤會直接丟錯，不會安靜回傳怪東西', () => {
    expect(() => sma([1, 2, 3], 0)).toThrow(TypeError)
    expect(() => sma([1, 2, 3], 2.5)).toThrow(TypeError)
    expect(() => sma('not an array', 3)).toThrow(TypeError)
  })
})
