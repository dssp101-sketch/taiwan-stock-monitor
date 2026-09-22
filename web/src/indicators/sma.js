import { isNum, assertArray, assertPeriod, nullArray } from './_helpers.js'

/**
 * 簡單移動平均（Simple Moving Average）。
 *
 * 每一格都重新把視窗加總一次，而不是用滾動加總加加減減。
 * 滾動加總會累積浮點誤差（實測 500 筆後相對誤差約 1e-15），
 * 重算的成本在這個資料量下可以忽略，換到的是「同樣輸入必定得到同樣輸出」。
 *
 * @param {number[]} values 數列，通常是收盤價
 * @param {number} period 週期
 * @returns {(number|null)[]} 與輸入等長。前 period-1 筆、或視窗內含非數字者為 null。
 */
export function sma(values, period) {
  assertArray(values)
  assertPeriod(period)

  const out = nullArray(values.length)

  for (let i = period - 1; i < values.length; i++) {
    let sum = 0
    let ok = true
    for (let j = i - period + 1; j <= i; j++) {
      if (!isNum(values[j])) {
        ok = false
        break
      }
      sum += values[j]
    }
    if (ok) out[i] = sum / period
  }
  return out
}
