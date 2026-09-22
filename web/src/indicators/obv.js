import { isNum, assertSameLength, nullArray } from './_helpers.js'

/**
 * OBV（能量潮 On-Balance Volume）。
 *
 *   收盤 > 前一日：OBV = 前一日 OBV + 成交量
 *   收盤 < 前一日：OBV = 前一日 OBV − 成交量
 *   收盤 = 前一日：OBV 不變
 *
 * 第一筆沒有「前一日」可比，依慣例以 0 起算（OBV 只看相對變化，起點不影響判讀）。
 * 成交量單位是「股」，與資料庫一致。
 *
 * @param {number[]} closes 收盤價
 * @param {number[]} volumes 成交量（股）
 * @returns {(number|null)[]} 與輸入等長
 */
export function obv(closes, volumes) {
  const len = assertSameLength([closes, volumes], ['closes', 'volumes'])
  const out = nullArray(len)

  let acc = null

  for (let i = 0; i < len; i++) {
    if (!isNum(closes[i]) || !isNum(volumes[i])) {
      acc = null
      continue
    }
    if (acc === null) {
      acc = 0
      out[i] = acc
      continue
    }
    const prevClose = closes[i - 1]
    if (!isNum(prevClose)) {
      acc = 0
      out[i] = acc
      continue
    }
    if (closes[i] > prevClose) acc += volumes[i]
    else if (closes[i] < prevClose) acc -= volumes[i]
    out[i] = acc
  }
  return out
}
