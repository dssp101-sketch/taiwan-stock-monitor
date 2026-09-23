/**
 * 端對端測試：用本機的模擬證交所伺服器，跑真正的 CLI 指令走完整流程。
 *
 * 模擬伺服器回傳的格式跟證交所一樣，三大法人用的是台積電 2023-01-30
 * 證交所實際公告過的數字（前面 twse.test.js 已經驗證過這組數字）。
 *
 * 驗證的是整條流程，而不是個別函式：
 *   加入追蹤池 → 抓資料寫成 JSON → 再跑一次會跳過 → 追蹤池變動後會重抓
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const run = promisify(execFile)
const SCRIPT = resolve(__dirname, '..', 'scripts', 'fetchTwse.js')

// 模擬的全市場資料：兩檔在追蹤池、一檔不在
const QUOTES = [
  ['3008', '大立光', '1,000,000', '5,000', '2,000,000,000', '1,990.00', '2,010.00', '1,980.00', '2,000.00', '+', '10.00'],
  ['0050', '元大台灣50', '30,000,000', '20,000', '1,500,000,000', '49.50', '50.20', '49.40', '50.00', '+', '0.30'],
  ['2330', '台積電', '22,009,927', '45,678', '54,678,491,997', '2,505.00', '2,510.00', '2,460.00', '2,460.00', '-', '45.00']
]

// 台積電 2023-01-30 證交所實際公告的三大法人（17 欄格式）
const TSMC_T86 = ['133,236,588', '52,595,539', '80,641,049', '0', '0', '0',
  '1,032,000', '94,327', '937,673', '880,408',
  '978,000', '537,000', '441,000', '1,227,511', '788,103', '439,408', '82,459,130']

const HOLIDAY = '很抱歉，沒有符合條件的資料!'

let server
let baseUrl
let requests = []
let holidays = new Set()

function respond(res, body) {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    const date = url.searchParams.get('date')
    requests.push(`${url.pathname}?${date}`)

    if (holidays.has(date)) return respond(res, { stat: HOLIDAY })

    if (url.pathname.endsWith('/MI_INDEX')) {
      return respond(res, {
        stat: 'OK',
        tables: [
          { title: '大盤統計資訊', data: [['發行量加權股價指數', '20,000']] },
          { title: '每日收盤行情(全部(不含權證、牛熊證))', data: QUOTES }
        ]
      })
    }
    if (url.pathname.endsWith('/T86')) {
      return respond(res, {
        stat: 'OK',
        data: QUOTES.map(([id, name]) => [id, name, ...TSMC_T86])
      })
    }
    if (url.pathname.endsWith('/MI_MARGN')) {
      return respond(res, {
        stat: 'OK',
        tables: [
          // 彙總表排在前面、標題含同樣關鍵字——findTable 不能抓到這張
          { title: '融資融券交易統計', data: [['融資(交易單位)', '1', '2']] },
          {
            title: '融資融券彙總',
            data: QUOTES.map(([id, name]) => [id, name,
              '10', '5', '1', '2,300', '2,390', '999,999',
              '1', '2', '0', '130', '135', '999,999', '3', ''])
          }
        ]
      })
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

afterAll(() => new Promise((r) => server.close(r)))

function cli(dataDir, ...args) {
  return run(process.execPath, [SCRIPT, ...args], {
    env: { ...process.env, TWSE_BASE_URL: baseUrl, TWSE_INTERVAL_MS: '0', DATA_DIR: dataDir },
    timeout: 60000
  })
}

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))

describe('fetchTwse.js 端對端', () => {
  it('完整流程：加入 → 抓取 → 接續 → 追蹤池變動後重抓', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'e2e-'))
    try {
      // ── 1. 加入追蹤池，其中 9999 不存在 ──
      requests = []
      const add = await cli(dir, '--add=3008,0050,9999')
      expect(add.stdout).toContain('3008 大立光')
      expect(add.stdout).toContain('0050 元大台灣50')
      expect(add.stdout).toContain('查無這些代號')
      expect(add.stdout).toContain('9999')

      const watchlist = readJson(join(dir, 'watchlist.json'))
      expect(watchlist.stocks.map((s) => s.stock_id)).toEqual(['0050', '3008'])

      // ── 2. 抓最近 7 天 ──
      requests = []
      const first = await cli(dir, '--mode=daily', '--days=7')
      expect(first.stdout).toContain('完成')
      const firstRequests = requests.length
      expect(firstRequests).toBeGreaterThan(0)
      expect(firstRequests % 3).toBe(0) // 每個交易日三個資料集

      const tsmcFile = join(dir, 'stocks', '2330.json')
      expect(existsSync(tsmcFile)).toBe(false) // 不在追蹤池的不寫檔

      const lgp = readJson(join(dir, 'stocks', '3008.json'))
      expect(lgp.name).toBe('大立光')
      expect(lgp.prices.length).toBe(firstRequests / 3)
      expect(lgp.prices[0]).toEqual({
        date: lgp.prices[0].date,
        open: 1990, high: 2010, low: 1980, close: 2000,
        volume: 1000000, turnover: 2000000000
      })

      // 三大法人：寫進檔的是六種類別的原始股數
      expect(lgp.flows[0].foreign_investor_buy).toBe(133236588)
      expect(lgp.flows[0].dealer_self_buy).toBe(978000)
      expect(lgp.flows[0].dealer_hedging_buy).toBe(1227511)

      // 融資融券：抓到明細表不是彙總表，而且張已換算成股
      expect(lgp.margin[0].margin_balance).toBe(2390 * 1000)
      expect(lgp.margin[0].short_balance).toBe(135 * 1000)

      // 日期由舊到新、沒有重複
      const dates = lgp.prices.map((p) => p.date)
      expect([...dates].sort()).toEqual(dates)
      expect(new Set(dates).size).toBe(dates.length)

      // ── 3. 再跑一次：全部跳過，不打證交所 ──
      requests = []
      const second = await cli(dir, '--mode=daily', '--days=7')
      expect(requests.length).toBe(0)
      expect(second.stdout).toContain('這次要抓 0 次')

      // 資料沒有因為重跑而重複
      expect(readJson(join(dir, 'stocks', '3008.json')).prices.length).toBe(dates.length)

      // ── 4. 追蹤池加一檔：所有日期都要重抓，新股票才有歷史資料 ──
      await cli(dir, '--add=2330')
      requests = []
      await cli(dir, '--mode=daily', '--days=7')
      expect(requests.length).toBe(firstRequests)

      const tsmc = readJson(tsmcFile)
      expect(tsmc.prices.length).toBe(dates.length)
      expect(tsmc.prices.at(-1).close).toBe(2460)

      // 舊股票重抓後也沒有重複
      expect(readJson(join(dir, 'stocks', '3008.json')).prices.length).toBe(dates.length)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60000)

  it('假日：證交所回「沒有資料」時記錄下來，不寫任何資料列', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'e2e-'))
    try {
      await cli(dir, '--add=3008')

      // 把整個區間都設成假日
      holidays = new Set()
      const today = new Date()
      for (let i = 0; i <= 7; i++) {
        const d = new Date(today)
        d.setUTCDate(d.getUTCDate() - i)
        holidays.add(d.toISOString().slice(0, 10).replace(/-/g, ''))
      }

      await cli(dir, '--mode=daily', '--days=7')
      const lgp = readJson(join(dir, 'stocks', '3008.json'))
      expect(lgp.prices).toEqual([])

      const log = readJson(join(dir, 'fetch_log.json'))
      const statuses = Object.values(log.entries).map((e) => e.status)
      expect(statuses.length).toBeGreaterThan(0)
      expect(statuses.every((s) => s === 'nodata')).toBe(true)
    } finally {
      holidays = new Set()
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60000)

  it('--check 不寫入任何檔案', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'e2e-'))
    try {
      const out = await cli(dir, '--check')
      expect(out.stdout).toContain('每日收盤行情')
      expect(out.stdout).toContain('追蹤清單目前 0 檔')
      expect(existsSync(join(dir, 'watchlist.json'))).toBe(false)
      expect(existsSync(join(dir, 'fetch_log.json'))).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60000)
})
