/**
 * 把資料庫撈出來的日 K 資料，整理成指標模組可以吃的乾淨數列。
 *
 * 處理 CLAUDE.md「已知的坑」提到的問題：
 * 無成交日的開高低收可能是 0，直接拿去算指標會嚴重失真，必須先整筆排除。
 */

/**
 * 判斷一筆日 K 是不是有效的交易日資料。
 * 開高低收任一為 0、負數、null 或非數字，就視為無效。
 */
export function isTradedRow(row) {
  if (!row) return false
  return ['open', 'high', 'low', 'close'].every((key) => {
    const v = row[key]
    return typeof v === 'number' && Number.isFinite(v) && v > 0
  })
}

/**
 * 濾掉無效的日 K，並依日期由舊到新排序。
 *
 * @param {object[]} rows daily_prices 查詢結果
 * @returns {{rows: object[], excluded: number}}
 *          excluded 是被排除的筆數，畫面上要誠實顯示出來，不要默默吃掉。
 */
export function cleanDailyPrices(rows) {
  if (!Array.isArray(rows)) {
    throw new TypeError(`rows 必須是陣列，收到 ${typeof rows}`)
  }
  const kept = rows.filter(isTradedRow)
  kept.sort((a, b) => String(a.date).localeCompare(String(b.date)))
  return { rows: kept, excluded: rows.length - kept.length }
}

/**
 * 從日 K 陣列抽出各欄位的數列，方便餵給指標函式。
 *
 * @param {object[]} rows 已經過 cleanDailyPrices 處理的資料
 */
export function toSeries(rows) {
  return {
    dates: rows.map((r) => r.date),
    opens: rows.map((r) => r.open),
    highs: rows.map((r) => r.high),
    lows: rows.map((r) => r.low),
    closes: rows.map((r) => r.close),
    volumes: rows.map((r) => r.volume)
  }
}
