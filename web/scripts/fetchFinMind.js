#!/usr/bin/env node
/**
 * 從 FinMind 抓資料寫進 Supabase。
 *
 * 由 GitHub Actions 在每個交易日收盤後執行，也可以在本機手動跑。
 * 前端永遠不會呼叫這支程式，也拿不到這裡用的任何祕密。
 *
 * 用法：
 *   node scripts/fetchFinMind.js --check
 *       只檢查環境變數、FinMind 連線與用量，不寫入任何資料。
 *
 *   node scripts/fetchFinMind.js --add=2330,2317,2454
 *       把股票加入追蹤池（會先從 TaiwanStockInfo 取得名稱與產業別）。
 *
 *   node scripts/fetchFinMind.js --mode=backfill --years=3
 *       首次回補：追蹤池近 3 年的日 K、法人、融資融券。
 *
 *   node scripts/fetchFinMind.js --mode=daily --days=7
 *       每日更新：只抓最近幾天，重複的資料會被 upsert 覆蓋。
 *
 * 需要的環境變數（全部只存在伺服器端）：
 *   FINMIND_TOKEN、SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { loadEnv, reportEnv } from './loadEnv.js'
import { mapStockInfo, mapPrice, mapMargin, pivotInstitutional } from '../src/lib/finmind.js'

const FINMIND_API = 'https://api.finmindtrade.com/api/v4/data'
const FINMIND_USER_INFO = 'https://api.web.finmindtrade.com/v2/user_info'

// 免費帳號有每小時請求上限。官方文件沒有寫死數字，所以這裡採保守的節流，
// 並在每次請求後讀回實際用量，接近上限就停下來，而不是硬撞到被擋。
const REQUEST_INTERVAL_MS = 1500
const USAGE_SAFETY_MARGIN = 20

// ─────────────────────────── 參數解析 ───────────────────────────

function parseArgs(argv) {
  const args = { mode: null, years: 3, days: 7, add: null, check: false, dryRun: false }
  for (const raw of argv.slice(2)) {
    const [key, value] = raw.replace(/^--/, '').split('=')
    switch (key) {
      case 'check': args.check = true; break
      case 'dry-run': args.dryRun = true; break
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

/** 回傳 YYYY-MM-DD。 */
function isoDate(d) {
  return d.toISOString().slice(0, 10)
}

function daysAgo(n) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return isoDate(d)
}

function yearsAgo(n) {
  const d = new Date()
  d.setUTCFullYear(d.getUTCFullYear() - n)
  return isoDate(d)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ─────────────────────────── FinMind ───────────────────────────

class FinMind {
  constructor(token) {
    this.token = token
    this.lastRequestAt = 0
    this.requestCount = 0
  }

  async #throttle() {
    const wait = REQUEST_INTERVAL_MS - (Date.now() - this.lastRequestAt)
    if (wait > 0) await sleep(wait)
    this.lastRequestAt = Date.now()
  }

  /** 讀回目前用量。回傳 { used, limit }，讀不到時回傳 null。 */
  async usage() {
    const res = await fetch(FINMIND_USER_INFO, {
      headers: { Authorization: `Bearer ${this.token}` }
    })
    if (!res.ok) return null
    const body = await res.json()
    const used = body?.user_count
    const limit = body?.api_request_limit
    if (typeof used !== 'number' || typeof limit !== 'number') return null
    return { used, limit }
  }

  /**
   * 取得一個 dataset 的資料。
   * FinMind 回傳格式：{ msg, status, data: [...] }
   */
  async getData({ dataset, dataId, startDate, endDate }) {
    const url = new URL(FINMIND_API)
    url.searchParams.set('dataset', dataset)
    if (dataId) url.searchParams.set('data_id', dataId)
    if (startDate) url.searchParams.set('start_date', startDate)
    if (endDate) url.searchParams.set('end_date', endDate)

    for (let attempt = 1; attempt <= 4; attempt++) {
      await this.#throttle()
      this.requestCount++

      let res
      try {
        res = await fetch(url, { headers: { Authorization: `Bearer ${this.token}` } })
      } catch (err) {
        if (attempt === 4) throw new Error(`連線 FinMind 失敗：${err.message}`)
        await sleep(2000 * 2 ** (attempt - 1))
        continue
      }

      if (res.status === 402 || res.status === 429) {
        throw new Error(`FinMind 用量已達上限（HTTP ${res.status}），請稍後再跑`)
      }
      if (res.status >= 500) {
        if (attempt === 4) throw new Error(`FinMind 伺服器錯誤 HTTP ${res.status}`)
        await sleep(2000 * 2 ** (attempt - 1))
        continue
      }
      if (!res.ok) {
        throw new Error(`FinMind 回應 HTTP ${res.status}：${(await res.text()).slice(0, 200)}`)
      }

      const body = await res.json()
      if (!Array.isArray(body?.data)) {
        throw new Error(`FinMind 回傳格式不如預期：${JSON.stringify(body).slice(0, 200)}`)
      }
      return body.data
    }
    throw new Error('不應該走到這裡')
  }
}

// ─────────────────────────── 抓取流程 ───────────────────────────

/** 每次抓取都留下紀錄，之後才查得出哪一天缺資料。 */
async function log(db, entry) {
  const { error } = await db.from('data_fetch_log').insert(entry)
  if (error) console.error(`⚠️  寫入 data_fetch_log 失敗：${error.message}`)
}

async function upsert(db, table, rows, conflict) {
  if (rows.length === 0) return 0
  // 分批寫入，避免單一請求過大
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

/** 把股票加入追蹤池（順便建立 stocks 那一筆，因為其他表有外鍵指向它）。 */
async function addToWatchlist(db, fm, stockIds) {
  console.log(`\n📋 取得 TaiwanStockInfo，準備加入 ${stockIds.length} 檔...`)
  const all = await fm.getData({ dataset: 'TaiwanStockInfo' })
  const wanted = new Set(stockIds)
  const found = all.map(mapStockInfo).filter((s) => s && wanted.has(s.stock_id))

  const missing = stockIds.filter((id) => !found.some((s) => s.stock_id === id))
  if (missing.length) {
    console.log(`⚠️  FinMind 查無這些代號，已跳過：${missing.join('、')}`)
  }
  if (found.length === 0) {
    console.log('沒有任何可加入的股票。')
    return
  }

  await upsert(db, 'stocks', found, 'stock_id')
  await upsert(db, 'watchlist', found.map((s) => ({ stock_id: s.stock_id })), 'stock_id')

  for (const s of found) console.log(`   ✅ ${s.stock_id} ${s.name}（${s.market}）`)
  console.log(`已加入追蹤池 ${found.length} 檔。`)
}

const DATASETS = [
  {
    dataset: 'TaiwanStockPrice',
    table: 'daily_prices',
    conflict: 'stock_id,date',
    transform: (rows) => ({ rows: rows.map(mapPrice).filter(Boolean), notes: [] })
  },
  {
    dataset: 'TaiwanStockInstitutionalInvestorsBuySell',
    table: 'institutional_flows',
    conflict: 'stock_id,date',
    transform: (rows) => {
      const { rows: pivoted, unknownCategories, skipped } = pivotInstitutional(rows)
      const notes = []
      if (unknownCategories.length) {
        notes.push(`出現沒看過的法人類別：${unknownCategories.join('、')}（已跳過 ${skipped} 列）`)
      }
      return { rows: pivoted, notes }
    }
  },
  {
    dataset: 'TaiwanStockMarginPurchaseShortSale',
    table: 'margin',
    conflict: 'stock_id,date',
    transform: (rows) => ({ rows: rows.map(mapMargin).filter(Boolean), notes: [] })
  }
]

async function fetchRange(db, fm, { startDate, endDate }) {
  const { data: watchlist, error } = await db.from('watchlist').select('stock_id')
  if (error) throw new Error(`讀取 watchlist 失敗：${error.message}`)

  if (!watchlist || watchlist.length === 0) {
    console.log('⚠️  追蹤池是空的。請先執行 --add=2330,2317 之類的指令加入股票。')
    return
  }
  if (watchlist.length > 50) {
    console.log(`⚠️  追蹤池有 ${watchlist.length} 檔，超過 CLAUDE.md 建議的 50 檔上限。`)
  }

  console.log(`\n📈 追蹤池 ${watchlist.length} 檔，抓取區間 ${startDate} ~ ${endDate}`)

  const summary = []

  for (const { stock_id: stockId } of watchlist) {
    for (const spec of DATASETS) {
      const usage = await fm.usage()
      if (usage && usage.limit - usage.used < USAGE_SAFETY_MARGIN) {
        console.log(`\n🛑 FinMind 用量 ${usage.used}/${usage.limit}，接近上限，主動停止。`)
        console.log('   已抓到的資料都已寫入，稍後再跑一次即可接續。')
        return summary
      }

      let raw
      try {
        raw = await fm.getData({
          dataset: spec.dataset,
          dataId: stockId,
          startDate,
          endDate
        })
      } catch (err) {
        console.error(`   ❌ ${stockId} ${spec.dataset}：${err.message}`)
        await log(db, {
          dataset: spec.dataset,
          stock_id: stockId,
          target_date: endDate,
          status: 'failed',
          row_count: 0,
          message: err.message.slice(0, 500)
        })
        summary.push({ stockId, dataset: spec.dataset, status: 'failed', count: 0 })
        continue
      }

      const { rows, notes } = spec.transform(raw)
      for (const n of notes) console.log(`   ⚠️  ${stockId} ${spec.dataset}：${n}`)

      const written = await upsert(db, spec.table, rows, spec.conflict)
      console.log(`   ✅ ${stockId} ${spec.dataset}：來源 ${raw.length} 列 → 寫入 ${written} 列`)

      await log(db, {
        dataset: spec.dataset,
        stock_id: stockId,
        target_date: endDate,
        status: written > 0 ? 'success' : 'skipped',
        row_count: written,
        message: notes.join('；').slice(0, 500) || null
      })
      summary.push({ stockId, dataset: spec.dataset, status: 'success', count: written })
    }
  }

  return summary
}

// ─────────────────────────── main ───────────────────────────

async function main() {
  const envResult = loadEnv()
  const args = parseArgs(process.argv)

  const token = requireEnv('FINMIND_TOKEN')
  const fm = new FinMind(token)

  if (args.check) {
    console.log('🔍 檢查模式（不會寫入任何資料）\n')
    reportEnv(envResult)
    console.log('')
    const usage = await fm.usage()
    if (usage) console.log(`FinMind 用量：${usage.used} / ${usage.limit}`)
    else console.log('⚠️  讀不到 FinMind 用量資訊（Token 可能無效）')

    const probe = await fm.getData({
      dataset: 'TaiwanStockPrice',
      dataId: '2330',
      startDate: daysAgo(10)
    })
    console.log(`FinMind 連線正常，試抓 2330 近 10 天得到 ${probe.length} 列`)
    if (probe.length) {
      console.log('第一列原始資料：', JSON.stringify(probe[0]))
      console.log('對應後：', JSON.stringify(mapPrice(probe[0])))
    }

    // Supabase 還沒建好時也要能單獨驗證 FinMind，所以這段是選用的。
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.log('\n⏭️  略過資料庫檢查：缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY。')
      console.log(`   請在 ${envResult.path} 補上這兩個變數。`)
      return
    }
    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false }
    })
    const { count, error } = await db.from('watchlist').select('*', { count: 'exact', head: true })
    if (error) {
      // PostgREST 在權限不足時可能回傳空的 message，所以把所有欄位都印出來
      const parts = [error.message, error.code && `code=${error.code}`, error.details, error.hint]
        .filter(Boolean)
      console.log(`⚠️  Supabase 連線失敗：${parts.join(' / ') || '（伺服器沒有回傳錯誤訊息）'}`)
      console.log('   最常見的原因是 SUPABASE_SERVICE_ROLE_KEY 填成了公開金鑰，請看上面的金鑰診斷。')
    } else {
      console.log(`✅ Supabase 連線正常，追蹤池目前 ${count} 檔`)
    }
    return
  }

  const db = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false }
  })

  if (args.add) {
    await addToWatchlist(db, fm, args.add)
    return
  }

  if (args.mode === 'backfill') {
    await fetchRange(db, fm, { startDate: yearsAgo(args.years), endDate: isoDate(new Date()) })
  } else if (args.mode === 'daily') {
    await fetchRange(db, fm, { startDate: daysAgo(args.days), endDate: isoDate(new Date()) })
  } else {
    throw new Error('請指定 --mode=backfill 或 --mode=daily，或使用 --check / --add')
  }

  console.log(`\n完成。本次共向 FinMind 發出 ${fm.requestCount} 次請求。`)
}

main().catch((err) => {
  console.error(`\n💥 ${err.message}`)
  process.exit(1)
})
