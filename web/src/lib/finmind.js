/**
 * FinMind 回傳資料 → 資料庫欄位的對應。
 *
 * 這個檔案只放**純函式**：不發送網路請求、不碰資料庫，方便完整單元測試。
 * 實際的抓取流程在 scripts/fetchFinMind.js。
 *
 * 欄位名稱來源：FinMind 官方套件原始碼 FinMind/data/data_loader.py 的
 * docstring（2026-09 版本），不是憑記憶寫的。幾個容易寫錯的地方：
 *   - TaiwanStockPrice 的最高、最低價欄位叫 max / min，不是 high / low
 *   - 成交量欄位叫 Trading_Volume，成交金額叫 Trading_money
 *   - TaiwanStockInfo 的市場別 type 是 twse / tpex，不是中文
 *   - 三大法人是「長表」，一天一檔有多列，靠 name 欄位區分類別
 */

/** FinMind 三大法人 name 欄位的六種值 → 資料庫欄位前綴。 */
export const INSTITUTIONAL_CATEGORIES = Object.freeze({
  Foreign_Investor: 'foreign_investor',
  Foreign_Dealer_Self: 'foreign_dealer_self',
  Investment_Trust: 'investment_trust',
  Dealer_self: 'dealer_self',
  Dealer_Hedging: 'dealer_hedging',
  Dealer: 'dealer'
})

/** 市場別代碼 → 中文顯示名稱。對照不到時回傳原始值，不隱藏未知的東西。 */
const MARKET_LABELS = Object.freeze({
  twse: '上市',
  tpex: '上櫃',
  emerging: '興櫃'
})

export function marketLabel(type) {
  if (typeof type !== 'string' || type === '') return null
  return MARKET_LABELS[type] ?? type
}

/** 轉成數字；null、undefined、空字串、非有限數一律回傳 null，絕不用 0 代替。 */
function num(v) {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/** 轉成整數（股數、金額都是整數）。 */
function int(v) {
  const n = num(v)
  return n === null ? null : Math.round(n)
}

/** 日期一律轉成 YYYY-MM-DD 字串。 */
function day(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v)) return null
  return v.slice(0, 10)
}

/**
 * TaiwanStockInfo → stocks
 * 來源欄位：stock_id、stock_name、industry_category、type
 */
export function mapStockInfo(row) {
  if (!row || typeof row.stock_id !== 'string' || row.stock_id === '') return null
  return {
    stock_id: row.stock_id,
    name: row.stock_name ?? row.stock_id,
    industry: row.industry_category ?? null,
    market: row.type ?? null
  }
}

/**
 * TaiwanStockPrice → daily_prices
 * 來源欄位：date、stock_id、open、max、min、close、Trading_Volume、Trading_money
 *
 * 無成交日的價格可能是 0，這裡**照實存**，不在寫入階段動手腳；
 * 計算指標前再由 lib/priceSeries.js 的 cleanDailyPrices() 過濾，
 * 這樣資料庫永遠是來源的忠實副本。
 */
export function mapPrice(row) {
  const date = day(row?.date)
  if (!row || !date || typeof row.stock_id !== 'string') return null
  return {
    stock_id: row.stock_id,
    date,
    open: num(row.open),
    high: num(row.max),
    low: num(row.min),
    close: num(row.close),
    volume: int(row.Trading_Volume),
    turnover: int(row.Trading_money)
  }
}

/**
 * TaiwanStockMarginPurchaseShortSale → margin
 * 來源欄位：MarginPurchaseTodayBalance、ShortSaleTodayBalance
 *
 * ⚠️ 單位未確認：FinMind 官方文件沒有標示這兩個欄位是「股」還是「張」。
 * 抓到真實資料後必須跟證交所公告核對，核對完成前不要用來做任何評分。
 */
export function mapMargin(row) {
  const date = day(row?.date)
  if (!row || !date || typeof row.stock_id !== 'string') return null
  return {
    stock_id: row.stock_id,
    date,
    margin_balance: int(row.MarginPurchaseTodayBalance),
    short_balance: int(row.ShortSaleTodayBalance)
  }
}

/**
 * TaiwanStockInstitutionalInvestorsBuySell（長表）→ institutional_flows（寬表）
 *
 * 來源一列長這樣：{ date, stock_id, name: 'Foreign_Investor', buy: 123, sell: 456 }
 * 同一檔同一天會有多列，每種法人類別一列。
 *
 * @param {object[]} rows FinMind 回傳的 data 陣列
 * @returns {{rows: object[], unknownCategories: string[], skipped: number}}
 *          unknownCategories 是沒看過的 name 值。**不會被靜默丟掉**，
 *          呼叫端要把它記錄下來，代表 FinMind 改了資料格式。
 */
export function pivotInstitutional(rows) {
  if (!Array.isArray(rows)) {
    throw new TypeError(`rows 必須是陣列，收到 ${typeof rows}`)
  }

  const byKey = new Map()
  const unknown = new Set()
  let skipped = 0

  for (const row of rows) {
    const date = day(row?.date)
    const stockId = row?.stock_id

    if (!date || typeof stockId !== 'string' || stockId === '') {
      skipped++
      continue
    }

    const prefix = INSTITUTIONAL_CATEGORIES[row.name]
    if (!prefix) {
      unknown.add(String(row?.name))
      skipped++
      continue
    }

    const key = `${stockId}__${date}`
    if (!byKey.has(key)) {
      byKey.set(key, { stock_id: stockId, date })
    }
    const target = byKey.get(key)

    // 同一天同一類別重複出現時累加，而不是後蓋前：
    // 證交所的自營商資料歷史上曾經分列呈現。
    const buyKey = `${prefix}_buy`
    const sellKey = `${prefix}_sell`
    const buy = int(row.buy)
    const sell = int(row.sell)
    if (buy !== null) target[buyKey] = (target[buyKey] ?? 0) + buy
    if (sell !== null) target[sellKey] = (target[sellKey] ?? 0) + sell
  }

  return {
    rows: [...byKey.values()],
    unknownCategories: [...unknown],
    skipped
  }
}
