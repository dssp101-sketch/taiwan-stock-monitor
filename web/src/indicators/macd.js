import { ema } from './ema.js'
import { isNum, assertArray, assertPeriod, nullArray } from './_helpers.js'

/**
 * MACD。
 *
 * 名詞依台灣看盤軟體慣例：
 *   DIF   = EMA(快線) − EMA(慢線)           （快慢線乖離）
 *   MACD  = DIF 的 EMA(signal)              （訊號線，台灣常稱 MACD 線）
 *   OSC   = DIF − MACD                      （柱狀圖 / 紅綠柱）
 *
 * 訊號線只在 DIF 有值的區段上計算，並以前 signal 筆 DIF 的簡單平均當種子。
 *
 * @param {number[]} values 收盤價
 * @param {number} [fast=12]
 * @param {number} [slow=26]
 * @param {number} [signal=9]
 * @returns {{dif:(number|null)[], macd:(number|null)[], osc:(number|null)[]}}
 */
export function macd(values, fast = 12, slow = 26, signal = 9) {
  assertArray(values)
  assertPeriod(fast, 'fast')
  assertPeriod(slow, 'slow')
  assertPeriod(signal, 'signal')
  if (fast >= slow) {
    throw new TypeError(`fast(${fast}) 必須小於 slow(${slow})`)
  }

  const len = values.length
  const fastEma = ema(values, fast)
  const slowEma = ema(values, slow)

  const dif = nullArray(len)
  for (let i = 0; i < len; i++) {
    if (isNum(fastEma[i]) && isNum(slowEma[i])) {
      dif[i] = fastEma[i] - slowEma[i]
    }
  }

  // 只把有值的 DIF 抽出來算 EMA，再塞回原本的位置。
  const idx = []
  const compact = []
  for (let i = 0; i < len; i++) {
    if (isNum(dif[i])) {
      idx.push(i)
      compact.push(dif[i])
    }
  }
  const compactSignal = ema(compact, signal)

  const macdLine = nullArray(len)
  const osc = nullArray(len)
  for (let j = 0; j < idx.length; j++) {
    const i = idx[j]
    if (isNum(compactSignal[j])) {
      macdLine[i] = compactSignal[j]
      osc[i] = dif[i] - compactSignal[j]
    }
  }

  return { dif, macd: macdLine, osc }
}
