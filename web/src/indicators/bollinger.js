import { isNum, assertArray, assertPeriod, nullArray } from './_helpers.js'
import { sma } from './sma.js'

/**
 * 布林通道（Bollinger Bands）。
 *
 * 中軌 = SMA(period)
 * 標準差採**母體標準差**（分母 n），與多數看盤軟體一致；
 * 若改用樣本標準差（分母 n−1），通道會略寬，兩者不可混用。
 *
 * @param {number[]} values 收盤價
 * @param {number} [period=20]
 * @param {number} [mult=2] 標準差倍數
 * @returns {{middle:(number|null)[], upper:(number|null)[], lower:(number|null)[],
 *            stddev:(number|null)[], bandwidth:(number|null)[]}}
 *          bandwidth = (上軌 − 下軌) / 中軌，用來判斷通道收斂程度。
 */
export function bollinger(values, period = 20, mult = 2) {
  assertArray(values)
  assertPeriod(period)
  if (typeof mult !== 'number' || !Number.isFinite(mult)) {
    throw new TypeError(`mult 必須是數字，收到 ${mult}`)
  }

  const len = values.length
  const middle = sma(values, period)
  const upper = nullArray(len)
  const lower = nullArray(len)
  const stddev = nullArray(len)
  const bandwidth = nullArray(len)

  for (let i = 0; i < len; i++) {
    if (!isNum(middle[i])) continue

    let sumSq = 0
    for (let j = i - period + 1; j <= i; j++) {
      const diff = values[j] - middle[i]
      sumSq += diff * diff
    }
    const sd = Math.sqrt(sumSq / period)

    stddev[i] = sd
    upper[i] = middle[i] + mult * sd
    lower[i] = middle[i] - mult * sd
    bandwidth[i] = middle[i] === 0 ? null : (upper[i] - lower[i]) / middle[i]
  }

  return { middle, upper, lower, stddev, bandwidth }
}
