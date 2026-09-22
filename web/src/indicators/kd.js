import { isNum, assertSameLength, assertPeriod, nullArray } from './_helpers.js'

/**
 * KD（隨機指標），台灣看盤軟體慣用的 9 日參數與 1/3 平滑。
 *
 *   RSV = (收盤 − 近 n 日最低) / (近 n 日最高 − 近 n 日最低) × 100
 *   K   = 前一日 K × 2/3 + RSV × 1/3
 *   D   = 前一日 D × 2/3 + K   × 1/3
 *
 * 第一筆的「前一日 K、D」依慣例以 50 起算。
 * 近 n 日最高等於最低（整段完全不動）時 RSV 取 50，避免除以 0。
 *
 * @param {number[]} highs 最高價
 * @param {number[]} lows 最低價
 * @param {number[]} closes 收盤價
 * @param {number} [period=9] RSV 回看天數
 * @param {number} [kSmooth=3] K 的平滑分母（3 代表 1/3）
 * @param {number} [dSmooth=3] D 的平滑分母
 * @returns {{k:(number|null)[], d:(number|null)[], rsv:(number|null)[]}}
 */
export function kd(highs, lows, closes, period = 9, kSmooth = 3, dSmooth = 3) {
  const len = assertSameLength([highs, lows, closes], ['highs', 'lows', 'closes'])
  assertPeriod(period)
  assertPeriod(kSmooth, 'kSmooth')
  assertPeriod(dSmooth, 'dSmooth')

  const rsv = nullArray(len)
  const k = nullArray(len)
  const d = nullArray(len)

  let prevK = null
  let prevD = null

  for (let i = 0; i < len; i++) {
    if (i < period - 1) continue

    let hh = -Infinity
    let ll = Infinity
    let ok = isNum(closes[i])
    for (let j = i - period + 1; j <= i && ok; j++) {
      if (!isNum(highs[j]) || !isNum(lows[j])) {
        ok = false
        break
      }
      if (highs[j] > hh) hh = highs[j]
      if (lows[j] < ll) ll = lows[j]
    }

    if (!ok) {
      // 視窗內有髒資料：整段重置，重新起算。
      prevK = null
      prevD = null
      continue
    }

    const range = hh - ll
    rsv[i] = range === 0 ? 50 : ((closes[i] - ll) / range) * 100

    const baseK = prevK === null ? 50 : prevK
    const baseD = prevD === null ? 50 : prevD

    prevK = (baseK * (kSmooth - 1)) / kSmooth + rsv[i] / kSmooth
    prevD = (baseD * (dSmooth - 1)) / dSmooth + prevK / dSmooth

    k[i] = prevK
    d[i] = prevD
  }

  return { k, d, rsv }
}
