import { describe, it, expect } from 'vitest'
import { obv } from '../src/indicators/obv.js'

describe('obv', () => {
  it('手算驗證：漲加、跌減、平盤不動', () => {
    const closes = [10, 11, 10, 10, 12]
    const volumes = [100, 200, 300, 400, 500]
    // 索引0：起點 0
    // 索引1：11 > 10 → 0 + 200 = 200
    // 索引2：10 < 11 → 200 − 300 = −100
    // 索引3：10 = 10 → 不變 = −100
    // 索引4：12 > 10 → −100 + 500 = 400
    expect(obv(closes, volumes)).toEqual([0, 200, -100, -100, 400])
  })

  it('一路上漲時 OBV 等於成交量累加', () => {
    const out = obv([1, 2, 3, 4], [10, 20, 30, 40])
    expect(out).toEqual([0, 20, 50, 90])
  })

  it('成交量單位是股，數字量級不會被偷偷除以 1000', () => {
    const out = obv([10, 11], [31578000, 31578000])
    expect(out[1]).toBe(31578000)
  })

  it('長度不一致會丟錯', () => {
    expect(() => obv([1, 2, 3], [1, 2])).toThrow(TypeError)
  })
})
