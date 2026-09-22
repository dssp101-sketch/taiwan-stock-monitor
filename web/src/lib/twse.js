/**
 * 證券交易所（TWSE，上市）公開資料的解析。
 *
 * 這個檔案只放**純函式**：不發送網路請求、不碰資料庫，方便完整單元測試。
 * 實際抓取流程在 scripts/fetchTwse.js。
 *
 * 為什麼加這個來源：證交所是**第一手**資料，免費、公開、沒有流量限制，
 * 數字直接對得上官方公告——也就是 CLAUDE.md 寫的階段一完成標準。
 * FinMind 也是從這裡來的，中間少一層轉手就少一層出錯可能。
 *
 * 端點與欄位定義來源：維護中的開源爬蟲 chunkai1312/node-twstock 的實作，
 * 以及 voidful/tw-institutional-stocker 存下來的證交所原始欄位標題，
 * 不是憑記憶寫的。
 *
 * ⚠️ 三個容易出錯的地方，都已經處理：
 *
 * 1. 單位不一致。日 K 的成交量是「股」，但融資融券是「張」。
 *    本模組一律轉成「股」再回傳，與資料庫的單位約定一致。
 *
 * 2. 欄位名稱會互相包含。「自營商買賣超股數」是「外資自營商買賣超股數」的
 *    子字串，用 includes() 比對會抓錯，導致自營商淨額幾乎全為 0。
 *    本模組一律用欄位位置搭配欄位數量驗證，不做名稱的模糊比對。
 *
 * 3. 三大法人的欄位數量隨年份變動（17 / 14 / 10 欄三種格式），
 *    回補歷史資料時會同時遇到。三種都支援，遇到沒看過的格式會明確報錯
 *    而不是默默解析出錯誤的數字。
 */

/** 一張 = 1000 股。融資融券的原始單位是張。 */
const SHARES_PER_LOT = 1000

export const TWSE_ENDPOINTS = Object.freeze({
  /** 每日收盤行情（全市場）。回傳的 tables[8] 才是個股資料。 */
  dailyQuotes: 'https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX',
  /** 三大法人買賣超日報（全市場）。 */
  institutional: 'https://www.twse.com.tw/rwd/zh/fund/T86',
  /** 融資融券餘額（全市場）。回傳的 tables[1] 才是個股資料。 */
  margin: 'https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN'
})

/** 把日期轉成證交所要的 YYYYMMDD。 */
export function toTwseDate(isoDate) {
  if (typeof isoDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    throw new TypeError(`日期必須是 YYYY-MM-DD 格式，收到 ${isoDate}`)
  }
  return isoDate.replace(/-/g, '')
}

export function buildUrl(endpoint, params) {
  const url = new URL(endpoint)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return url.toString()
}

/**
 * 證交所的數字是帶逗號的字串，缺值是 '--'，漲跌有時是 'X0.00'。
 * 轉不出數字時一律回傳 null，**絕不用 0 代替**。
 */
export function parseNumber(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw !== 'string') return null

  const cleaned = raw.replace(/,/g, '').replace(/\s/g, '').trim()
  if (cleaned === '' || cleaned === '--' || cleaned === '---') return null

  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/** 張 → 股。資料不足時維持 null。 */
function lotsToShares(lots) {
  const n = parseNumber(lots)
  return n === null ? null : Math.round(n * SHARES_PER_LOT)
}

function asInt(raw) {
  const n = parseNumber(raw)
  return n === null ? null : Math.round(n)
}

/**
 * 這一列看起來是不是個股資料列。
 *
 * 刻意只做最寬鬆的檢查（4~7 碼英數），**不去猜哪些代號是權證、ETF 還是普通股**。
 * 代號規則會變（例如 5 碼的 00878 是 ETF、6 碼的 030001 是權證），猜錯就會
 * 默默漏掉資料。真正的篩選交給呼叫端用追蹤池比對，這裡只負責濾掉
 * 合計列、說明列之類明顯不是個股的東西。
 */
function looksLikeStockRow(symbol) {
  return typeof symbol === 'string' && /^[0-9A-Z]{4,7}$/.test(symbol.trim())
}

// ─────────────────────── 每日收盤行情 ───────────────────────

/**
 * 解析 MI_INDEX（每日收盤行情）。
 *
 * 個股資料在 tables 裡「每日收盤行情」那張表。證交所回傳多張表，
 * 索引會隨當日公告內容變動，所以這裡**用表格標題找**，不寫死索引。
 *
 * 每一列：[證券代號, 證券名稱, 成交股數, 成交筆數, 成交金額,
 *          開盤價, 最高價, 最低價, 收盤價, 漲跌(+/-), 漲跌價差, ...]
 *
 * @param {object} json 證交所回傳的 JSON
 * @param {string} isoDate 該筆資料的日期 YYYY-MM-DD
 * @returns {object[]} daily_prices 格式，成交量單位為「股」
 */
export function parseDailyQuotes(json, isoDate) {
  const table = findTable(json, ['每日收盤行情'])
  if (!table) return []

  const out = []
  for (const row of table.data ?? []) {
    const [symbol, , ...v] = row
    if (!looksLikeStockRow(symbol)) continue

    out.push({
      stock_id: symbol.trim(),
      date: isoDate,
      open: parseNumber(v[3]),
      high: parseNumber(v[4]),
      low: parseNumber(v[5]),
      close: parseNumber(v[6]),
      volume: asInt(v[0]),   // 成交股數，已經是「股」
      turnover: asInt(v[2])  // 成交金額，單位「元」
    })
  }
  return out
}

// ─────────────────────── 三大法人 ───────────────────────

/**
 * 解析 T86（三大法人買賣超日報）。
 *
 * 欄位數量隨年份不同，共三種格式。以下索引都是扣掉
 * [證券代號, 證券名稱] 之後的位置：
 *
 * 17 欄（現行）：
 *   0-2   外資及陸資(不含外資自營商) 買進／賣出／買賣超
 *   3-5   外資自營商
 *   6-8   投信
 *   9     自營商買賣超（合計，只有淨額）
 *   10-12 自營商(自行買賣)
 *   13-15 自營商(避險)
 *   16    三大法人買賣超
 *
 * 14 欄（較早）：外資及陸資未拆出外資自營商
 * 10 欄（最早）：自營商未拆成自行買賣與避險
 *
 * 單位一律是「股」（證交所欄位標題為「買賣超股數」）。
 */
export function parseInstitutional(json, isoDate) {
  const rows = json?.data
  if (!Array.isArray(rows)) return { rows: [], unknownShapes: [] }

  const out = []
  const unknownShapes = new Set()

  for (const row of rows) {
    const [symbol, , ...v] = row
    if (!looksLikeStockRow(symbol)) continue

    const base = { stock_id: symbol.trim(), date: isoDate }
    let mapped

    if (v.length === 17) {
      mapped = {
        foreign_investor_buy: asInt(v[0]),
        foreign_investor_sell: asInt(v[1]),
        foreign_dealer_self_buy: asInt(v[3]),
        foreign_dealer_self_sell: asInt(v[4]),
        investment_trust_buy: asInt(v[6]),
        investment_trust_sell: asInt(v[7]),
        dealer_self_buy: asInt(v[10]),
        dealer_self_sell: asInt(v[11]),
        dealer_hedging_buy: asInt(v[13]),
        dealer_hedging_sell: asInt(v[14])
        // v[9] 是自營商買賣超合計，等於自行買賣加避險，不另外存避免重複計算
      }
    } else if (v.length === 14) {
      mapped = {
        // 這個年代的「外資及陸資」已含外資自營商，直接放進外資欄位
        foreign_investor_buy: asInt(v[0]),
        foreign_investor_sell: asInt(v[1]),
        investment_trust_buy: asInt(v[3]),
        investment_trust_sell: asInt(v[4]),
        dealer_self_buy: asInt(v[7]),
        dealer_self_sell: asInt(v[8]),
        dealer_hedging_buy: asInt(v[10]),
        dealer_hedging_sell: asInt(v[11])
      }
    } else if (v.length === 10) {
      mapped = {
        foreign_investor_buy: asInt(v[0]),
        foreign_investor_sell: asInt(v[1]),
        investment_trust_buy: asInt(v[3]),
        investment_trust_sell: asInt(v[4]),
        // 這個年代自營商沒有拆自行買賣與避險，用合併欄位存
        dealer_buy: asInt(v[6]),
        dealer_sell: asInt(v[7])
      }
    } else {
      // 沒看過的格式：不猜，記錄下來讓呼叫端知道證交所改格式了
      unknownShapes.add(v.length)
      continue
    }

    out.push({ ...base, ...mapped })
  }

  return { rows: out, unknownShapes: [...unknownShapes] }
}

/**
 * 取出證交所**公告的**淨額欄位。
 *
 * T86 同時公告各分項買賣股數與淨額合計。本專案的淨額一律由資料庫的計算欄位
 * 自行算出（避免來源與計算不一致），所以 parseInstitutional() 不存這些欄位。
 *
 * 但正因為兩邊是獨立來源，就可以拿來互相驗證：
 * **我從分項自己加出來的淨額，必須等於證交所公告的淨額。**
 * 對不上就代表欄位位置抓錯了。這是 scripts/fetchTwse.js --verify 在做的事。
 *
 * @returns {Map<string, {foreign:number, trust:number, dealer:number, total:number}>}
 *          key 是證券代號
 */
export function publishedInstitutionalNets(json) {
  const out = new Map()
  for (const row of json?.data ?? []) {
    const [symbol, , ...v] = row
    if (!looksLikeStockRow(symbol)) continue

    let nets
    if (v.length === 17) {
      // 外資淨額 = 外資及陸資淨額 + 外資自營商淨額
      const a = parseNumber(v[2])
      const b = parseNumber(v[5])
      nets = {
        foreign: a === null || b === null ? null : a + b,
        trust: parseNumber(v[8]),
        dealer: parseNumber(v[9]),
        total: parseNumber(v[16])
      }
    } else if (v.length === 14) {
      nets = {
        foreign: parseNumber(v[2]),
        trust: parseNumber(v[5]),
        dealer: parseNumber(v[6]),
        total: parseNumber(v[13])
      }
    } else if (v.length === 10) {
      nets = {
        foreign: parseNumber(v[2]),
        trust: parseNumber(v[5]),
        dealer: parseNumber(v[8]),
        total: parseNumber(v[9])
      }
    } else {
      continue
    }
    out.set(String(symbol).trim(), nets)
  }
  return out
}

/**
 * 從我解析出來的分項欄位算出淨額，算法與資料庫的計算欄位完全一致。
 * 用來跟 publishedInstitutionalNets() 對照。
 */
export function computeNets(row) {
  const n = (v) => (typeof v === 'number' ? v : 0)
  const foreign =
    n(row.foreign_investor_buy) + n(row.foreign_dealer_self_buy) -
    n(row.foreign_investor_sell) - n(row.foreign_dealer_self_sell)
  const trust = n(row.investment_trust_buy) - n(row.investment_trust_sell)
  const dealer =
    n(row.dealer_self_buy) + n(row.dealer_hedging_buy) + n(row.dealer_buy) -
    n(row.dealer_self_sell) - n(row.dealer_hedging_sell) - n(row.dealer_sell)
  return { foreign, trust, dealer, total: foreign + trust + dealer }
}

// ─────────────────────── 融資融券 ───────────────────────

/**
 * 解析 MI_MARGN（融資融券餘額）。
 *
 * 每一列（扣掉代號與名稱後）：
 *   0-5   融資：買進／賣出／現金償還／前日餘額／今日餘額／限額
 *   6-11  融券：買進／賣出／現券償還／前日餘額／今日餘額／限額
 *   12    資券互抵
 *
 * ⚠️ 證交所這份報表的單位是「**張**」，與日 K 的「股」不同。
 * 這裡一律乘以 1000 轉成「股」再回傳，與資料庫的單位約定一致。
 */
export function parseMargin(json, isoDate) {
  const table = findTable(json, ['融資融券', '信用交易'])
  if (!table) return []

  const out = []
  for (const row of table.data ?? []) {
    const [symbol, , ...v] = row
    if (!looksLikeStockRow(symbol)) continue

    out.push({
      stock_id: symbol.trim(),
      date: isoDate,
      margin_balance: lotsToShares(v[4]), // 融資今日餘額（張 → 股）
      short_balance: lotsToShares(v[10]) // 融券今日餘額（張 → 股）
    })
  }
  return out
}

// ─────────────────────── 共用 ───────────────────────

/**
 * 從證交所的多表回應裡找出想要的那張表。
 *
 * 表格順序會隨當日公告內容變動，寫死索引遲早會抓錯表，
 * 所以改用標題關鍵字比對。找不到時回傳 null，由呼叫端決定怎麼處理。
 */
export function findTable(json, keywords) {
  const tables = json?.tables
  if (!Array.isArray(tables)) return null

  const candidates = tables.filter((t) => {
    const title = String(t?.title ?? '')
    return keywords.some((k) => title.includes(k)) && Array.isArray(t?.data)
  })
  if (candidates.length === 0) return null

  // 同一份回應裡常常有「彙總表」和「個股明細表」，標題都含同樣的關鍵字，
  // 而且彙總表往往排在前面。只取第一個符合的會抓到彙總表，資料就會是空的。
  // 所以優先挑「第一列第一格看起來像證券代號」的那張表。
  const perStock = candidates.find((t) => looksLikeStockRow(t.data?.[0]?.[0]))
  if (perStock) return perStock

  // 都不像個股表時，退而取資料列最多的那張，並讓呼叫端自己判斷。
  return candidates.reduce((a, b) => ((b.data?.length ?? 0) > (a.data?.length ?? 0) ? b : a))
}

/** 證交所用 stat 欄位表示這次查詢有沒有資料（例如假日就沒有）。 */
export function isOk(json) {
  return json?.stat === 'OK'
}
