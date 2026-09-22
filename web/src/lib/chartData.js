/**
 * 把資料庫的資料轉成 lightweight-charts 需要的格式。
 *
 * 純函式，不碰 DOM 也不碰圖表物件，方便單元測試。
 *
 * lightweight-charts 的時間欄位接受 'YYYY-MM-DD' 字串（business day），
 * 所以日期直接原樣傳入即可。
 */

/** 上漲與下跌的顏色。台股習慣紅漲綠跌，與歐美相反。 */
export const UP_COLOR = '#d64545'
export const DOWN_COLOR = '#2f9e64'
export const FLAT_COLOR = '#888888'

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v)
}

/**
 * 日 K 陣列 → K 線資料。
 * 開高低收任一缺值的那筆會被跳過（不補值、不猜測）。
 *
 * @param {object[]} rows 已經過 cleanDailyPrices 處理的資料
 */
export function toCandles(rows) {
  if (!Array.isArray(rows)) throw new TypeError('rows 必須是陣列')
  const out = []
  for (const r of rows) {
    if (!r?.date) continue
    if (!isNum(r.open) || !isNum(r.high) || !isNum(r.low) || !isNum(r.close)) continue
    out.push({ time: r.date, open: r.open, high: r.high, low: r.low, close: r.close })
  }
  return out
}

/**
 * 日 K 陣列 → 成交量長條。顏色依當日漲跌決定（收 ≥ 開為紅）。
 * 成交量維持「股」，顯示時才換算成「張」。
 */
export function toVolumeBars(rows) {
  if (!Array.isArray(rows)) throw new TypeError('rows 必須是陣列')
  const out = []
  for (const r of rows) {
    if (!r?.date || !isNum(r.volume)) continue
    let color = FLAT_COLOR
    if (isNum(r.open) && isNum(r.close)) {
      color = r.close >= r.open ? UP_COLOR : DOWN_COLOR
    }
    out.push({ time: r.date, value: r.volume, color })
  }
  return out
}

/**
 * 指標輸出（含 null）→ 折線資料。
 *
 * 指標模組回傳的陣列與日期陣列等長，資料不足的位置是 null。
 * 這裡直接把 null 的點略過，讓線從有資料的地方才開始畫，
 * **不補 0、不補前值**，否則畫面會出現不存在的走勢。
 *
 * @param {string[]} dates 日期陣列
 * @param {(number|null)[]} values 指標輸出
 */
export function toLine(dates, values) {
  if (!Array.isArray(dates) || !Array.isArray(values)) {
    throw new TypeError('dates 與 values 必須是陣列')
  }
  if (dates.length !== values.length) {
    throw new TypeError(`dates(${dates.length}) 與 values(${values.length}) 長度必須相同`)
  }
  const out = []
  for (let i = 0; i < dates.length; i++) {
    if (!isNum(values[i]) || !dates[i]) continue
    out.push({ time: dates[i], value: values[i] })
  }
  return out
}

/**
 * 指標輸出 → 長條圖資料（給 MACD 的 OSC 柱用），依正負上色。
 */
export function toHistogram(dates, values) {
  return toLine(dates, values).map((p) => ({
    ...p,
    color: p.value >= 0 ? UP_COLOR : DOWN_COLOR
  }))
}

/**
 * 計算一組資料的「涵蓋率」，用來誠實顯示資料完整度。
 *
 * @returns {{total:number, present:number, missing:number, ratio:number|null}}
 */
export function coverage(values) {
  if (!Array.isArray(values)) throw new TypeError('values 必須是陣列')
  const total = values.length
  const present = values.filter(isNum).length
  return {
    total,
    present,
    missing: total - present,
    ratio: total === 0 ? null : present / total
  }
}
