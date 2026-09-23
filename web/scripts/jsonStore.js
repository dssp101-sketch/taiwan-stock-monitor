/**
 * 以 JSON 檔案取代資料庫的儲存層。
 *
 * 為什麼不用資料庫：Supabase 免費方案只能開兩個專案，要開新的就得暫停別的。
 * 這個專案的資料量很小（幾檔股票 × 幾年 ≈ 幾千筆），JSON 檔完全夠用，
 * 而且沒有專案數量上限、不會閒置被暫停、不需要任何金鑰。
 *
 * 檔案結構（都在 web/public/data/ 底下，會隨網站一起部署）：
 *
 *   watchlist.json        追蹤清單，要加股票就改這個（或用 --add）
 *   stocks/<代號>.json     每檔一個檔，含日 K、三大法人、融資融券
 *   fetch_log.json        抓取紀錄，中斷後接續用
 *
 * 三個設計重點：
 *
 * 1. 原子寫入。先寫到 .tmp 再改名，回補途中被中斷也不會留下半個檔案。
 * 2. 每筆資料一行。每天只新增幾行，git 的變更紀錄才看得清楚，
 *    repo 也不會因為每天整個檔案重寫而快速膨脹。
 * 3. 同一天重抓是覆蓋不是重複。跟原本資料庫的 upsert 行為一致。
 *
 * 三大法人只存六種類別的原始買賣股數，淨額一律在讀取端用 computeNets() 算，
 * 跟原本「資料庫計算欄位」的精神相同：不從來源寫入淨額，避免兩邊不一致。
 */
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data')

/** 每檔股票的三種資料。 */
export const ROW_KINDS = Object.freeze(['prices', 'flows', 'margin'])

// ─────────────────────── 純函式（可單元測試） ───────────────────────

/**
 * 依日期合併：同一天的新資料覆蓋舊資料，結果依日期由舊到新排序。
 * 不修改傳入的陣列。
 */
export function mergeByDate(existing, incoming) {
  const byDate = new Map()
  for (const row of existing ?? []) {
    if (row?.date) byDate.set(row.date, row)
  }
  for (const row of incoming ?? []) {
    if (row?.date) byDate.set(row.date, row)
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * 移除資料列裡的 stock_id。
 * 檔案本身就是以代號命名，每一列都重複寫代號只是浪費空間。
 */
export function stripStockId(row) {
  const { stock_id: _ignored, ...rest } = row
  return rest
}

/**
 * 把一檔股票的資料序列化成「每筆資料一行」的 JSON。
 *
 * 一般的 JSON.stringify(obj, null, 2) 會把每個物件拆成十幾行，
 * 每天新增一筆日 K 就是十幾行的 git 變更；這裡每筆只佔一行。
 * 輸出是合法的 JSON，JSON.parse 讀得回來。
 */
export function serializeStockFile(data) {
  const header = ['stock_id', 'name', 'market', 'updated_at']
    .filter((k) => data[k] !== undefined)
    .map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(data[k])}`)

  const arrays = ROW_KINDS.map((kind) => {
    const rows = data[kind] ?? []
    if (rows.length === 0) return `  ${JSON.stringify(kind)}: []`
    const lines = rows.map((r) => `    ${JSON.stringify(r)}`).join(',\n')
    return `  ${JSON.stringify(kind)}: [\n${lines}\n  ]`
  })

  return `{\n${[...header, ...arrays].join(',\n')}\n}\n`
}

/** 抓取紀錄也是一筆一行，而且依 key 排序，讓 git 變更穩定。 */
export function serializeFetchLog(log) {
  const keys = Object.keys(log.entries ?? {}).sort()
  if (keys.length === 0) return '{\n  "entries": {}\n}\n'
  const lines = keys.map((k) => `    ${JSON.stringify(k)}: ${JSON.stringify(log.entries[k])}`)
  return `{\n  "entries": {\n${lines.join(',\n')}\n  }\n}\n`
}

export function logKey(dataset, date) {
  return `${dataset}|${date}`
}

/**
 * 判斷某個 (資料集, 日期) 這次可不可以跳過。
 *
 * - 成功過、而且當時的追蹤池跟現在一樣 → 跳過
 * - 證交所回「沒有資料」（假日）、而且那天已經過了好幾天 → 跳過
 *   （最近幾天可能只是還沒公告，不能當假日跳過）
 * - 其他一律重抓
 *
 * @param {object|undefined} entry fetch_log 裡的那筆紀錄
 * @param {string} date YYYY-MM-DD
 * @param {string} hash 目前追蹤池的雜湊
 * @param {string} today YYYY-MM-DD
 */
export function canSkip(entry, date, hash, today) {
  if (!entry) return false

  if (entry.status === 'success') return entry.watchlist_hash === hash

  if (entry.status === 'nodata') {
    // 跟追蹤池無關：證交所那天整個市場都沒資料
    const ageDays = (Date.parse(today) - Date.parse(date)) / 86400000
    return ageDays > 3
  }

  return false
}

// ─────────────────────── 檔案存取 ───────────────────────

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback
  const text = readFileSync(path, 'utf8').replace(/^﻿/, '')
  try {
    return JSON.parse(text)
  } catch (err) {
    throw new Error(`${path} 不是合法的 JSON，可能手動編輯時打錯了：${err.message}`)
  }
}

/** 先寫 .tmp 再改名。改名在同一個磁碟上是原子操作，不會留下寫到一半的檔案。 */
function writeAtomic(path, text) {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, text, 'utf8')
  renameSync(tmp, path)
}

/**
 * 建立一個儲存區。資料讀進記憶體後在記憶體裡改，呼叫 flush() 才寫回磁碟。
 * 回補時每處理完一天 flush 一次，既不會每筆都寫檔，中斷時也最多損失一天。
 */
export function createStore(dataDir = DEFAULT_DATA_DIR) {
  const paths = {
    watchlist: resolve(dataDir, 'watchlist.json'),
    log: resolve(dataDir, 'fetch_log.json'),
    stock: (id) => resolve(dataDir, 'stocks', `${id}.json`)
  }

  const stockCache = new Map()
  const dirtyStocks = new Set()
  let log = null
  let logDirty = false

  function loadStock(id) {
    if (!stockCache.has(id)) {
      const data = readJson(paths.stock(id), { stock_id: id, prices: [], flows: [], margin: [] })
      for (const kind of ROW_KINDS) data[kind] ??= []
      stockCache.set(id, data)
    }
    return stockCache.get(id)
  }

  function loadLog() {
    if (!log) log = readJson(paths.log, { entries: {} })
    log.entries ??= {}
    return log
  }

  return {
    dataDir,
    paths,

    /** @returns {{stock_id:string, name:string, market:string}[]} */
    readWatchlist() {
      const data = readJson(paths.watchlist, { stocks: [] })
      return Array.isArray(data.stocks) ? data.stocks : []
    },

    writeWatchlist(stocks) {
      const sorted = [...stocks].sort((a, b) => a.stock_id.localeCompare(b.stock_id))
      writeAtomic(paths.watchlist, `${JSON.stringify({ stocks: sorted }, null, 2)}\n`)
    },

    readStock(id) {
      return loadStock(id)
    },

    /** 設定股票的名稱與市場別（加入追蹤池時用）。 */
    setStockInfo(id, { name, market }) {
      const data = loadStock(id)
      data.stock_id = id
      if (name) data.name = name
      if (market) data.market = market
      dirtyStocks.add(id)
    },

    /**
     * 把某一種資料併入某檔股票。
     * @param {'prices'|'flows'|'margin'} kind
     */
    upsertRows(id, kind, rows) {
      if (!ROW_KINDS.includes(kind)) throw new Error(`不認得的資料種類：${kind}`)
      if (rows.length === 0) return 0
      const data = loadStock(id)
      data[kind] = mergeByDate(data[kind], rows.map(stripStockId))
      dirtyStocks.add(id)
      return rows.length
    },

    getLogEntry(dataset, date) {
      return loadLog().entries[logKey(dataset, date)]
    },

    setLogEntry(dataset, date, entry) {
      loadLog().entries[logKey(dataset, date)] = { ...entry, fetched_at: new Date().toISOString() }
      logDirty = true
    },

    /** 把記憶體裡改過的東西寫回磁碟。回傳寫了幾個檔。 */
    flush() {
      let written = 0
      for (const id of dirtyStocks) {
        const data = stockCache.get(id)
        data.updated_at = new Date().toISOString()
        writeAtomic(paths.stock(id), serializeStockFile(data))
        written++
      }
      dirtyStocks.clear()

      if (logDirty) {
        writeAtomic(paths.log, serializeFetchLog(log))
        logDirty = false
        written++
      }
      return written
    }
  }
}
