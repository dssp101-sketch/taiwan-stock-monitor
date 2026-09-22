#!/usr/bin/env node
/**
 * 從證券交易所（TWSE，上市）公開資料抓取並寫進 Supabase。
 *
 * 跟 fetchFinMind.js 的差別：
 *   - 不需要 Token，沒有流量限制，資料是第一手
 *   - 證交所的端點是「一次給全市場一天」，FinMind 是「一檔給一段期間」
 *     所以回補 3 年要跑約 730 個交易日，中斷後必須能接續
 *   - 目前只涵蓋上市（TWSE）。上櫃（TPEx）是另一個機構的端點，尚未實作
 *
 * 用法：
 *   node scripts/fetchTwse.js --check
 *   node scripts/fetchTwse.js --add=2330,2317
 *   node scripts/fetchTwse.js --mode=daily --days=7
 *   node scripts/fetchTwse.js --mode=backfill --years=3
 *
 * 需要的環境變數：SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import {
  TWSE_ENDPOINTS, buildUrl, toTwseDate, isOk,
  parseDailyQuotes, parseInstitutional, parseMargin
} from '../src/lib/twse.js'

// 證交所沒有公告流量上限，但短時間內密集請求會被擋。保守一點，
// 反正回補是一次性的，跑久一點總比被擋掉好。
const REQUEST_INTERVAL_MS = 3000
const USER_AGENT = 'taiwan-stock-monitor/0.1 (personal use)'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function parseArgs(argv) {
  const args = { mode: null, years: 3, days: 7, add: null, check: false }
  for (const raw of argv.slice(2)) {
    const [key, value] = raw.replace(/^--/, '').split('=')
    switch (key) {
      case 'check': args.check = true; break
      case 'mode': args.mode = value; break
      case 'years': args.years = Number(value); break
      case 'days': args.days = Number(value); break
      case 'add': args.add = (value ?? '').split(',').map((s) => s.trim()).filter(Boolean); break
      default: throw new Error(`不認得的參數：--${key}`)
    }
  }
  return args
}

function requireEnv(name) {
  const v = process.env[name]
  if (!v) throw new Error(`缺少環境變數 ${name}`)
  return v
}

const isoDate = (d) => d.toISOString().slice(0, 10)

/** 產生區間內的日期，由舊到新，跳過週末。國定假日靠證交所回傳空資料判斷。 */
function tradingDayCandidates(startDate, endDate) {
  const out = []
  const cur = new Date(`${startDate}T00:00:00Z`)
  const end = new Date(`${endDate}T00:00:00Z`)
  while (cur <= end) {
    const dow = cur.getUTCDay()
    if (dow !== 0 && dow !== 6) out.push(isoDate(cur))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return out
}

// ─────────────────────── 證交所請求 ───────────────────────

let lastRequestAt = 0

async function twseGet(endpoint, params) {
  const wait = REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt)
  if (wait > 0) await sleep(wait)
  lastRequestAt = Date.now()

  const url = buildUrl(endpoint, params)

  for (let attempt = 1; attempt <= 4; attempt++) {
    let res
    try {
      res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } })
    } catch (err) {
      if (attempt === 4) throw new Error(`連線證交所失敗：${err.message}`)
      await sleep(3000 * 2 ** (attempt - 1))
      continue
    }

    if (res.status === 429 || res.status === 403) {
      // 被擋了就等久一點再試，不要繼續猛打
      if (attempt === 4) throw new Error(`證交所擋下請求（HTTP ${res.status}），請稍後再跑`)
      await sleep(15000 * attempt)
      continue
    }
    if (res.status >= 500) {
      if (attempt === 4) throw new Error(`證交所伺服器錯誤 HTTP ${res.status}`)
      await sleep(3000 * 2 ** (attempt - 1))
      continue
    }
    if (!res.ok) throw new Error(`證交所回應 HTTP ${res.status}`)

    const text = await res.text()
    try {
      return JSON.parse(text)
    } catch {
      throw new Error(`證交所回傳的不是 JSON（前 120 字）：${text.slice(0, 120)}`)
    }
  }
  throw new Error('不應該走到這裡')
}

// ─────────────────────── 資料庫 ───────────────────────

async function upsert(db, table, rows, conflict) {
  if (rows.length === 0) return 0
  const CHUNK = 500
  let written = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const { error } = await db.from(table).upsert(chunk, { onConflict: conflict })
    if (error) throw new Error(`寫入 ${table} 失敗：${error.message}`)
    written += chunk.length
  }
  return written
}

async function log(db, entry) {
  const { error } = await db.from('data_fetch_log').insert(entry)
  if (error) console.error(`⚠️  寫入 data_fetch_log 失敗：${error.message}`)
}

/** 已經成功抓過的 (dataset, date)，用來中斷後接續，不重複打證交所。 */
async function alreadyDone(db, datasets, startDate, endDate) {
  const done = new Set()
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('data_fetch_log')
      .select('dataset, target_date, status')
      .in('dataset', datasets)
      .eq('status', 'success')
      .gte('target_date', startDate)
      .lte('target_date', endDate)
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`讀取 data_fetch_log 失敗：${error.message}`)
    for (const r of data ?? []) done.add(`${r.dataset}__${r.target_date}`)
    if (!data || data.length < PAGE) break
  }
  return done
}

// ─────────────────────── 三個資料集 ───────────────────────

const DATASETS = [
  {
    name: 'TWSE_MI_INDEX',
    label: '每日收盤行情',
    table: 'daily_prices',
    conflict: 'stock_id,date',
    endpoint: TWSE_ENDPOINTS.dailyQuotes,
    params: (d) => ({ date: toTwseDate(d), type: 'ALLBUT0999', response: 'json' }),
    parse: (json, d) => ({ rows: parseDailyQuotes(json, d), notes: [] })
  },
  {
    name: 'TWSE_T86',
    label: '三大法人買賣超',
    table: 'institutional_flows',
    conflict: 'stock_id,date',
    endpoint: TWSE_ENDPOINTS.institutional,
    params: (d) => ({ date: toTwseDate(d), selectType: 'ALLBUT0999', response: 'json' }),
    parse: (json, d) => {
      const { rows, unknownShapes } = parseInstitutional(json, d)
      const notes = unknownShapes.length
        ? [`出現沒看過的欄位數量：${unknownShapes.join('、')}，證交所可能改了格式`]
        : []
      return { rows, notes }
    }
  },
  {
    name: 'TWSE_MI_MARGN',
    label: '融資融券餘額',
    table: 'margin',
    conflict: 'stock_id,date',
    endpoint: TWSE_ENDPOINTS.margin,
    params: (d) => ({ date: toTwseDate(d), selectType: 'ALL', response: 'json' }),
    parse: (json, d) => ({ rows: parseMargin(json, d), notes: [] })
  }
]

// ─────────────────────── 流程 ───────────────────────

/** 把股票加入追蹤池。名稱與市場別從當日收盤行情取得。 */
async function addToWatchlist(db, stockIds) {
  console.log(`\n📋 從證交所當日收盤行情取得 ${stockIds.length} 檔的名稱...`)

  // 往回找最近一個有資料的交易日
  let rows = []
  for (const d of tradingDayCandidates(isoDate(new Date(Date.now() - 12 * 86400000)), isoDate(new Date())).reverse()) {
    const json = await twseGet(TWSE_ENDPOINTS.dailyQuotes, {
      date: toTwseDate(d), type: 'ALLBUT0999', response: 'json'
    })
    if (!isOk(json)) continue
    const table = json.tables?.find((t) => String(t.title ?? '').includes('每日收盤行情'))
    rows = (table?.data ?? []).map((r) => ({ stock_id: String(r[0]).trim(), name: String(r[1]).trim() }))
    if (rows.length) {
      console.log(`   使用 ${d} 的收盤行情，共 ${rows.length} 檔`)
      break
    }
  }
  if (rows.length === 0) throw new Error('找不到最近的收盤行情，無法取得股票名稱')

  const wanted = new Set(stockIds)
  const found = rows.filter((r) => wanted.has(r.stock_id)).map((r) => ({
    stock_id: r.stock_id, name: r.name, market: 'twse'
  }))

  const missing = stockIds.filter((id) => !found.some((s) => s.stock_id === id))
  if (missing.length) {
    console.log(`⚠️  證交所當日行情查無這些代號（可能是上櫃股，本腳本尚未支援）：${missing.join('、')}`)
  }
  if (found.length === 0) return

  await upsert(db, 'stocks', found, 'stock_id')
  await upsert(db, 'watchlist', found.map((s) => ({ stock_id: s.stock_id })), 'stock_id')
  for (const s of found) console.log(`   ✅ ${s.stock_id} ${s.name}`)
}

async function fetchRange(db, { startDate, endDate }) {
  const { data: watchlist, error } = await db.from('watchlist').select('stock_id')
  if (error) throw new Error(`讀取 watchlist 失敗：${error.message}`)
  if (!watchlist?.length) {
    console.log('⚠️  追蹤池是空的。請先執行 --add=2330,2317 加入股票。')
    return
  }

  const tracked = new Set(watchlist.map((w) => w.stock_id))
  const days = tradingDayCandidates(startDate, endDate)
  const done = await alreadyDone(db, DATASETS.map((d) => d.name), startDate, endDate)

  const totalTasks = days.length * DATASETS.length
  console.log(`\n📈 追蹤池 ${tracked.size} 檔，區間 ${startDate} ~ ${endDate}`)
  console.log(`   共 ${days.length} 個可能的交易日 × ${DATASETS.length} 個資料集 = ${totalTasks} 次請求`)
  console.log(`   其中 ${done.size} 次先前已成功，這次會跳過`)
  console.log(`   節流 ${REQUEST_INTERVAL_MS}ms／次，預估還要 ${Math.ceil((totalTasks - done.size) * REQUEST_INTERVAL_MS / 60000)} 分鐘\n`)

  let ok = 0, skipped = 0, failed = 0

  for (const day of days) {
    for (const spec of DATASETS) {
      if (done.has(`${spec.name}__${day}`)) { skipped++; continue }

      let json
      try {
        json = await twseGet(spec.endpoint, spec.params(day))
      } catch (err) {
        console.error(`   ❌ ${day} ${spec.label}：${err.message}`)
        await log(db, {
          dataset: spec.name, target_date: day, status: 'failed',
          row_count: 0, message: err.message.slice(0, 500)
        })
        failed++
        continue
      }

      // 假日或尚未公告時證交所會回傳 stat 不是 OK，這不是錯誤
      if (!isOk(json)) {
        await log(db, {
          dataset: spec.name, target_date: day, status: 'skipped',
          row_count: 0, message: String(json?.stat ?? '').slice(0, 500)
        })
        skipped++
        continue
      }

      const { rows, notes } = spec.parse(json, day)
      for (const n of notes) console.log(`   ⚠️  ${day} ${spec.label}：${n}`)

      // 證交所一次給全市場，只留追蹤池裡的
      const mine = rows.filter((r) => tracked.has(r.stock_id))
      const written = await upsert(db, spec.table, mine, spec.conflict)

      await log(db, {
        dataset: spec.name, target_date: day,
        status: 'success', row_count: written,
        message: notes.join('；').slice(0, 500) || null
      })
      ok++

      if (written > 0) {
        console.log(`   ✅ ${day} ${spec.label}：全市場 ${rows.length} 檔 → 寫入追蹤池 ${written} 檔`)
      }
    }
  }

  console.log(`\n完成。成功 ${ok}、跳過 ${skipped}、失敗 ${failed}。`)
  if (failed > 0) console.log('失敗的日期已記錄在 data_fetch_log，再跑一次就會自動重試。')
}

async function main() {
  const args = parseArgs(process.argv)

  if (args.check) {
    console.log('🔍 檢查模式（不會寫入任何資料）\n')

    // 往回找最近一個有資料的交易日
    for (const d of tradingDayCandidates(isoDate(new Date(Date.now() - 12 * 86400000)), isoDate(new Date())).reverse()) {
      const json = await twseGet(TWSE_ENDPOINTS.dailyQuotes, {
        date: toTwseDate(d), type: 'ALLBUT0999', response: 'json'
      })
      if (!isOk(json)) { console.log(`${d}：${json?.stat ?? '無資料'}`); continue }

      const rows = parseDailyQuotes(json, d)
      console.log(`✅ ${d} 每日收盤行情：解析出 ${rows.length} 檔`)
      const tsmc = rows.find((r) => r.stock_id === '2330')
      if (tsmc) console.log('   台積電：', JSON.stringify(tsmc))

      const t86 = await twseGet(TWSE_ENDPOINTS.institutional, {
        date: toTwseDate(d), selectType: 'ALLBUT0999', response: 'json'
      })
      if (isOk(t86)) {
        const { rows: flows, unknownShapes } = parseInstitutional(t86, d)
        console.log(`✅ 三大法人：解析出 ${flows.length} 檔` +
          (unknownShapes.length ? `（沒看過的欄位數量：${unknownShapes.join('、')}）` : ''))
        const f = flows.find((r) => r.stock_id === '2330')
        if (f) console.log('   台積電：', JSON.stringify(f))
      }

      const mg = await twseGet(TWSE_ENDPOINTS.margin, {
        date: toTwseDate(d), selectType: 'ALL', response: 'json'
      })
      if (isOk(mg)) {
        const margins = parseMargin(mg, d)
        console.log(`✅ 融資融券：解析出 ${margins.length} 檔`)
        const m = margins.find((r) => r.stock_id === '2330')
        if (m) console.log('   台積電（已由張換算成股）：', JSON.stringify(m))
      }
      break
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.log('\n⏭️  尚未設定 Supabase 環境變數，略過資料庫檢查。')
      return
    }
    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false }
    })
    const { count, error } = await db.from('watchlist').select('*', { count: 'exact', head: true })
    if (error) console.log(`⚠️  Supabase 連線失敗：${error.message}`)
    else console.log(`Supabase 連線正常，追蹤池目前 ${count} 檔`)
    return
  }

  const db = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false }
  })

  if (args.add) return addToWatchlist(db, args.add)

  const today = isoDate(new Date())
  if (args.mode === 'backfill') {
    const start = new Date()
    start.setUTCFullYear(start.getUTCFullYear() - args.years)
    await fetchRange(db, { startDate: isoDate(start), endDate: today })
  } else if (args.mode === 'daily') {
    const start = new Date()
    start.setUTCDate(start.getUTCDate() - args.days)
    await fetchRange(db, { startDate: isoDate(start), endDate: today })
  } else {
    throw new Error('請指定 --mode=backfill 或 --mode=daily，或使用 --check / --add')
  }
}

main().catch((err) => {
  console.error(`\n💥 ${err.message}`)
  process.exit(1)
})
