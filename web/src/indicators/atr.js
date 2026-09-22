import { isNum, assertSameLength, assertPeriod, nullArray } from './_helpers.js'

/**
 * 真實波幅（True Range）。
 *
 *   TR = max(當日高 − 當日低,
 *            |當日高 − 前一日收|,
 *            |當日低 − 前一日收|)
 *
 * 第一筆沒有前一日收盤價，回傳 null（不用「高 − 低」硬湊，那不是同一個定義）。
 *
 * @param {number[]} highs
 * @param {number[]} lows
 * @param {number[]} closes
 * @returns {(number|null)[]}
 */
export function trueRange(highs, lows, closes) {
  const len = assertSameLength([highs, lows, closes], ['highs', 'lows', 'closes'])
  const out = nullArray(len)

  for (let i = 1; i < len; i++) {
    const h = highs[i]
    const l = lows[i]
    const pc = closes[i - 1]
    if (!isNum(h) || !isNum(l) || !isNum(pc)) continue
    out[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc))
  }
  return out
}

/**
 * ATR（平均真實波幅），採 Wilder 原始平滑法。
 *
 *   前 period 筆 TR 的簡單平均當種子，
 *   之後 ATR = (前一日 ATR × (period − 1) + 當日 TR) / period
 *
 * @param {number[]} highs
 * @param {number[]} lows
 * @param {number[]} closes
 * @param {number} [period=14]
 * @returns {(number|null)[]} 與輸入等長，第一個值落在索引 period。
 */
export function atr(highs, lows, closes, period = 14) {
  assertPeriod(period)
  const tr = trueRange(highs, lows, closes)
  const out = nullArray(tr.length)

  let prev = null
  let seedSum = 0
  let seedCount = 0

  for (let i = 0; i < tr.length; i++) {
    if (!isNum(tr[i])) {
      prev = null
      seedSum = 0
      seedCount = 0
      continue
    }
    if (prev === null) {
      seedSum += tr[i]
      seedCount++
      if (seedCount === period) {
        prev = seedSum / period
        out[i] = prev
      }
    } else {
      prev = (prev * (period - 1) + tr[i]) / period
      out[i] = prev
    }
  }
  return out
}
