import { isNum, assertArray, assertPeriod, nullArray } from './_helpers.js'

/**
 * RSI（相對強弱指標），採 Wilder 原始平滑法。
 *
 *   前 period 筆漲跌幅的簡單平均當種子，
 *   之後 avg = (前一日 avg × (period − 1) + 當日值) / period
 *   RSI = 100 − 100 / (1 + 平均漲幅 / 平均跌幅)
 *
 * 平均跌幅為 0 時 RSI = 100；平均漲幅為 0 時 RSI = 0；
 * 兩者都是 0（區間內價格完全不動）時回傳 50，代表不偏多也不偏空。
 *
 * @param {number[]} values 收盤價
 * @param {number} [period=14]
 * @returns {(number|null)[]} 與輸入等長，第一個值落在索引 period。
 */
export function rsi(values, period = 14) {
  assertArray(values)
  assertPeriod(period)

  const out = nullArray(values.length)

  let avgGain = null
  let avgLoss = null
  let seedGain = 0
  let seedLoss = 0
  let seedCount = 0

  for (let i = 1; i < values.length; i++) {
    const cur = values[i]
    const prev = values[i - 1]

    if (!isNum(cur) || !isNum(prev)) {
      // 髒資料：重置，重新找種子。
      avgGain = null
      avgLoss = null
      seedGain = 0
      seedLoss = 0
      seedCount = 0
      continue
    }

    const diff = cur - prev
    const gain = diff > 0 ? diff : 0
    const loss = diff < 0 ? -diff : 0

    if (avgGain === null) {
      seedGain += gain
      seedLoss += loss
      seedCount++
      if (seedCount === period) {
        avgGain = seedGain / period
        avgLoss = seedLoss / period
        out[i] = toRsi(avgGain, avgLoss)
      }
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period
      avgLoss = (avgLoss * (period - 1) + loss) / period
      out[i] = toRsi(avgGain, avgLoss)
    }
  }
  return out
}

function toRsi(avgGain, avgLoss) {
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100
  if (avgGain === 0) return 0
  return 100 - 100 / (1 + avgGain / avgLoss)
}
