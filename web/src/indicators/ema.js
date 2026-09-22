import { isNum, assertArray, assertPeriod, nullArray } from './_helpers.js'

/**
 * 指數移動平均（Exponential Moving Average）。
 *
 * 種子採用業界最通用的作法：以前 period 筆的簡單平均當第一個值，
 * 之後 EMA = 現值 × k + 前一日 EMA × (1 − k)，k = 2 / (period + 1)。
 *
 * @param {number[]} values 數列
 * @param {number} period 週期
 * @returns {(number|null)[]} 與輸入等長，前 period-1 筆為 null。
 */
export function ema(values, period) {
  assertArray(values)
  assertPeriod(period)

  const k = 2 / (period + 1)
  const out = nullArray(values.length)

  let prev = null
  let seedSum = 0
  let seedCount = 0

  for (let i = 0; i < values.length; i++) {
    const v = values[i]

    if (!isNum(v)) {
      // 遇到髒資料：輸出 null，並重新開始找種子，不讓它汙染後續。
      prev = null
      seedSum = 0
      seedCount = 0
      continue
    }

    if (prev === null) {
      seedSum += v
      seedCount++
      if (seedCount === period) {
        prev = seedSum / period
        out[i] = prev
      }
    } else {
      prev = v * k + prev * (1 - k)
      out[i] = prev
    }
  }
  return out
}
