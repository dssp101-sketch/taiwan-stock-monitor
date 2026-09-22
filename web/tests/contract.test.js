import { describe, it, expect } from 'vitest'
import { sma, ema, macd, rsi, kd, bollinger, obv, atr } from '../src/indicators/index.js'

// 共通約定的守門測試：任何一個指標破壞了下列規則，這裡就會紅。
const closes = [10, 11, 12, 11, 13, 14, 13, 15, 16, 15, 17, 18, 17, 19, 20]
const highs = closes.map((c) => c + 1)
const lows = closes.map((c) => c - 1)
const volumes = closes.map((_, i) => (i + 1) * 100000)

const cases = [
  ['sma', () => sma(closes, 5)],
  ['ema', () => ema(closes, 5)],
  ['rsi', () => rsi(closes, 5)],
  ['obv', () => obv(closes, volumes)],
  ['atr', () => atr(highs, lows, closes, 5)],
  ['macd.dif', () => macd(closes, 3, 6, 3).dif],
  ['macd.macd', () => macd(closes, 3, 6, 3).macd],
  ['macd.osc', () => macd(closes, 3, 6, 3).osc],
  ['kd.k', () => kd(highs, lows, closes, 5).k],
  ['kd.d', () => kd(highs, lows, closes, 5).d],
  ['bollinger.middle', () => bollinger(closes, 5).middle],
  ['bollinger.upper', () => bollinger(closes, 5).upper],
  ['bollinger.lower', () => bollinger(closes, 5).lower]
]

describe('指標共通約定', () => {
  it.each(cases)('%s 輸出長度與輸入相同', (_name, fn) => {
    expect(fn()).toHaveLength(closes.length)
  })

  it.each(cases)('%s 資料不足的位置是 null，不是 0、NaN 或 undefined', (_name, fn) => {
    for (const v of fn()) {
      if (v === null) continue
      expect(typeof v).toBe('number')
      expect(Number.isNaN(v)).toBe(false)
      expect(Number.isFinite(v)).toBe(true)
    }
  })

  it.each(cases)('%s 不會改動傳入的陣列', (_name, fn) => {
    const snapshot = [closes, highs, lows, volumes].map((a) => [...a])
    fn()
    expect(closes).toEqual(snapshot[0])
    expect(highs).toEqual(snapshot[1])
    expect(lows).toEqual(snapshot[2])
    expect(volumes).toEqual(snapshot[3])
  })

  it.each(cases)('%s 是純函式，連續兩次呼叫結果相同', (_name, fn) => {
    expect(fn()).toEqual(fn())
  })

  it.each(cases)('%s 傳入空陣列時回傳空陣列，不會爆掉', (_name) => {
    expect(sma([], 5)).toEqual([])
    expect(ema([], 5)).toEqual([])
    expect(rsi([], 5)).toEqual([])
    expect(obv([], [])).toEqual([])
    expect(atr([], [], [], 5)).toEqual([])
    expect(macd([], 3, 6, 3).dif).toEqual([])
    expect(kd([], [], [], 5).k).toEqual([])
    expect(bollinger([], 5).middle).toEqual([])
  })
})
