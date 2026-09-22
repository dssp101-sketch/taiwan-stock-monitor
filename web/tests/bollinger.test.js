import { describe, it, expect } from 'vitest'
import { bollinger } from '../src/indicators/bollinger.js'

describe('bollinger', () => {
  it('手算驗證：課本經典數列 [2,4,4,4,5,5,7,9]', () => {
    // 平均 = 40/8 = 5
    // 離差平方和 = 9+1+1+1+0+0+4+16 = 32，母體變異數 = 32/8 = 4，標準差 = 2
    // 上軌 = 5 + 2×2 = 9，下軌 = 5 − 2×2 = 1
    const { middle, upper, lower, stddev, bandwidth } = bollinger([2, 4, 4, 4, 5, 5, 7, 9], 8, 2)
    expect(middle[7]).toBeCloseTo(5, 10)
    expect(stddev[7]).toBeCloseTo(2, 10)
    expect(upper[7]).toBeCloseTo(9, 10)
    expect(lower[7]).toBeCloseTo(1, 10)
    expect(bandwidth[7]).toBeCloseTo(1.6, 10) // (9−1)/5
  })

  it('價格完全不動時標準差為 0，上中下三軌重合', () => {
    const { middle, upper, lower, stddev } = bollinger([30, 30, 30, 30], 4)
    expect(stddev[3]).toBe(0)
    expect(upper[3]).toBe(30)
    expect(middle[3]).toBe(30)
    expect(lower[3]).toBe(30)
  })

  it('倍數放大時通道等比例變寬', () => {
    const a = bollinger([2, 4, 4, 4, 5, 5, 7, 9], 8, 1)
    const b = bollinger([2, 4, 4, 4, 5, 5, 7, 9], 8, 3)
    expect(a.upper[7]).toBeCloseTo(7, 10)
    expect(b.upper[7]).toBeCloseTo(11, 10)
  })

  it('資料不足時三軌都是 null', () => {
    const { middle, upper, lower } = bollinger([1, 2, 3], 20)
    expect(middle.every((v) => v === null)).toBe(true)
    expect(upper.every((v) => v === null)).toBe(true)
    expect(lower.every((v) => v === null)).toBe(true)
  })
})
