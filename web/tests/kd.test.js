import { describe, it, expect } from 'vitest'
import { kd } from '../src/indicators/kd.js'

describe('kd', () => {
  it('手算驗證：3 日 KD', () => {
    const highs = [10, 11, 12, 13]
    const lows = [8, 9, 10, 11]
    const closes = [9, 10, 11, 12]

    // 索引2：近 3 日最高 12、最低 8，收 11 → RSV = (11−8)/4×100 = 75
    //   K = 50×2/3 + 75/3 = 175/3 ≈ 58.333333
    //   D = 50×2/3 + K/3  = 475/9 ≈ 52.777778
    // 索引3：近 3 日最高 13、最低 9，收 12 → RSV = (12−9)/4×100 = 75
    //   K = (175/3)×2/3 + 75/3 = 575/9  ≈ 63.888889
    //   D = (475/9)×2/3 + K/3  = 1525/27 ≈ 56.481481
    const { k, d, rsv } = kd(highs, lows, closes, 3)

    expect(rsv[2]).toBeCloseTo(75, 10)
    expect(k[2]).toBeCloseTo(175 / 3, 10)
    expect(d[2]).toBeCloseTo(475 / 9, 10)

    expect(rsv[3]).toBeCloseTo(75, 10)
    expect(k[3]).toBeCloseTo(575 / 9, 10)
    expect(d[3]).toBeCloseTo(1525 / 27, 10)
  })

  it('收在最高點 RSV = 100，收在最低點 RSV = 0', () => {
    const top = kd([10, 11, 12], [8, 9, 10], [9, 10, 12], 3)
    expect(top.rsv[2]).toBeCloseTo(100, 10)

    const bottom = kd([10, 11, 12], [8, 9, 10], [9, 10, 8], 3)
    expect(bottom.rsv[2]).toBeCloseTo(0, 10)
  })

  it('最高等於最低（完全不動）時 RSV 取 50，不會除以 0', () => {
    const { rsv, k, d } = kd([5, 5, 5], [5, 5, 5], [5, 5, 5], 3)
    expect(rsv[2]).toBe(50)
    expect(k[2]).toBe(50)
    expect(d[2]).toBe(50)
    expect(Number.isNaN(k[2])).toBe(false)
  })

  it('K 與 D 永遠落在 0 到 100 之間', () => {
    let seed = 99
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    const closes = Array.from({ length: 200 }, () => 100 + rand() * 40)
    const highs = closes.map((c) => c + rand() * 3)
    const lows = closes.map((c) => c - rand() * 3)

    const { k, d } = kd(highs, lows, closes, 9)
    for (const arr of [k, d]) {
      for (const v of arr) {
        if (v !== null) {
          expect(v).toBeGreaterThanOrEqual(0)
          expect(v).toBeLessThanOrEqual(100)
        }
      }
    }
  })

  it('資料不足時回傳 null', () => {
    const { k, d } = kd([10, 11], [8, 9], [9, 10], 9)
    expect(k).toEqual([null, null])
    expect(d).toEqual([null, null])
  })

  it('三個陣列長度不一致會丟錯', () => {
    expect(() => kd([1, 2, 3], [1, 2], [1, 2, 3], 3)).toThrow(TypeError)
  })
})
