import { describe, it, expect } from 'vitest'
import { sharesToLots, SHARES_PER_LOT } from '../src/lib/units.js'

describe('sharesToLots', () => {
  it('1000 股等於 1 張', () => {
    expect(SHARES_PER_LOT).toBe(1000)
    expect(sharesToLots(1000)).toBe(1)
  })

  it('換算一般買超股數', () => {
    expect(sharesToLots(1_234_000)).toBe(1234)
  })

  it('保留小數並四捨五入到指定位數', () => {
    expect(sharesToLots(1555)).toBe(1.56)
    expect(sharesToLots(1555, 0)).toBe(2)
  })

  it('負數（賣超）維持負號', () => {
    expect(sharesToLots(-2_500_000)).toBe(-2500)
  })

  it('零就是零，不當成資料不足', () => {
    expect(sharesToLots(0)).toBe(0)
  })

  it('資料不足時回傳 null，不用 0 填補', () => {
    expect(sharesToLots(null)).toBeNull()
    expect(sharesToLots(undefined)).toBeNull()
    expect(sharesToLots(NaN)).toBeNull()
    expect(sharesToLots('1000')).toBeNull()
  })
})
