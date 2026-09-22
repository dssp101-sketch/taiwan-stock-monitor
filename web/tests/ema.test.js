import { describe, it, expect } from 'vitest'
import { ema } from '../src/indicators/ema.js'

describe('ema', () => {
  it('手算驗證：[1,2,3,4,5] 的 3 日 EMA', () => {
    // k = 2/(3+1) = 0.5
    // 索引2 種子 = (1+2+3)/3 = 2
    // 索引3 = 4×0.5 + 2×0.5 = 3
    // 索引4 = 5×0.5 + 3×0.5 = 4
    expect(ema([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4])
  })

  it('價格完全不動時 EMA 等於該價格', () => {
    const out = ema([50, 50, 50, 50, 50], 3)
    expect(out.slice(2)).toEqual([50, 50, 50])
  })

  it('週期 1 時 EMA 等於原始數列（k = 1）', () => {
    expect(ema([3, 1, 4, 1, 5], 1)).toEqual([3, 1, 4, 1, 5])
  })

  it('資料不足時回傳 null', () => {
    expect(ema([1, 2], 5)).toEqual([null, null])
  })

  it('遇到髒資料會重新找種子，不讓髒值汙染後面全部', () => {
    const out = ema([1, 2, 3, null, 4, 5, 6, 7], 3)
    expect(out[2]).toBe(2)          // 種子
    expect(out[3]).toBeNull()       // 髒資料本身
    expect(out[4]).toBeNull()       // 重新累積種子
    expect(out[5]).toBeNull()
    expect(out[6]).toBe(5)          // (4+5+6)/3 新種子
    expect(out[7]).toBe(6)          // 7×0.5 + 5×0.5
  })
})
