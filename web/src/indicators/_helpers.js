/**
 * 指標模組共用的小工具。
 *
 * 全模組共通約定：
 * 1. 輸入是「乾淨的數字陣列」。呼叫端要先用 lib/priceSeries.js 把無成交日
 *    （收盤價 0）之類的髒資料濾掉。
 * 2. 輸出長度一律跟輸入相同，資料不足的位置是 null，**絕不用 0 或前值填補**。
 * 3. 防禦性處理：萬一輸入仍夾雜非數字，該位置輸出 null，遞迴型指標（EMA、
 *    RSI、KD、ATR）會重新尋找種子，不會把髒值傳染給後面所有資料。
 */

/** 是不是可用於計算的有限數字。 */
export function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v)
}

/** 檢查參數是不是正整數週期。 */
export function assertPeriod(period, name = 'period') {
  if (!Number.isInteger(period) || period < 1) {
    throw new TypeError(`${name} 必須是 >= 1 的整數，收到 ${period}`)
  }
}

/** 檢查輸入是不是陣列。 */
export function assertArray(arr, name = 'values') {
  if (!Array.isArray(arr)) {
    throw new TypeError(`${name} 必須是陣列，收到 ${typeof arr}`)
  }
}

/** 幾個等長陣列的長度檢查。 */
export function assertSameLength(arrays, names) {
  arrays.forEach((a, i) => assertArray(a, names[i]))
  const len = arrays[0].length
  arrays.forEach((a, i) => {
    if (a.length !== len) {
      throw new TypeError(`${names.join('、')} 長度必須相同（${names[i]} 為 ${a.length}，預期 ${len}）`)
    }
  })
  return len
}

/** 產生一個全是 null 的陣列。 */
export function nullArray(len) {
  return new Array(len).fill(null)
}
