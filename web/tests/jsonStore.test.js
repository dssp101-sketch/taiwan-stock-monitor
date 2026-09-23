import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  mergeByDate, stripStockId, serializeStockFile, serializeFetchLog,
  canSkip, createStore, logKey
} from '../scripts/jsonStore.js'

describe('mergeByDate', () => {
  it('合併後依日期由舊到新', () => {
    const out = mergeByDate(
      [{ date: '2026-09-22', close: 2 }],
      [{ date: '2026-09-19', close: 1 }]
    )
    expect(out.map((r) => r.date)).toEqual(['2026-09-19', '2026-09-22'])
  })

  it('同一天的新資料覆蓋舊資料，不會變成兩筆', () => {
    const out = mergeByDate(
      [{ date: '2026-09-22', close: 100 }],
      [{ date: '2026-09-22', close: 101 }]
    )
    expect(out).toEqual([{ date: '2026-09-22', close: 101 }])
  })

  it('不修改傳入的陣列', () => {
    const a = [{ date: '2026-09-22', close: 1 }]
    const b = [{ date: '2026-09-19', close: 2 }]
    mergeByDate(a, b)
    expect(a).toHaveLength(1)
    expect(b).toHaveLength(1)
  })

  it('沒有日期的列被丟掉', () => {
    expect(mergeByDate([], [{ close: 1 }, { date: '2026-09-22' }])).toHaveLength(1)
  })

  it('空值不會丟錯', () => {
    expect(mergeByDate(undefined, null)).toEqual([])
  })
})

describe('stripStockId', () => {
  it('移除 stock_id，其他欄位保留', () => {
    expect(stripStockId({ stock_id: '2330', date: 'd', close: 1 })).toEqual({ date: 'd', close: 1 })
  })
})

describe('serializeStockFile', () => {
  const data = {
    stock_id: '3008',
    name: '大立光',
    market: 'twse',
    prices: [
      { date: '2026-09-19', close: 2000 },
      { date: '2026-09-22', close: 2010 }
    ],
    flows: [],
    margin: [{ date: '2026-09-22', margin_balance: 1000, short_balance: 0 }]
  }

  it('輸出是合法 JSON，讀回來內容完全相同', () => {
    expect(JSON.parse(serializeStockFile(data))).toEqual(data)
  })

  it('每筆資料只佔一行（git 變更才看得清楚）', () => {
    const lines = serializeStockFile(data).split('\n')
    const priceLines = lines.filter((l) => l.includes('"close"'))
    expect(priceLines).toHaveLength(2)
  })

  it('新增一天只會多一行', () => {
    const before = serializeStockFile(data).split('\n').length
    const more = { ...data, prices: [...data.prices, { date: '2026-09-23', close: 2020 }] }
    const after = serializeStockFile(more).split('\n').length
    expect(after - before).toBe(1)
  })

  it('空陣列也是合法 JSON', () => {
    const empty = { stock_id: '1', prices: [], flows: [], margin: [] }
    expect(JSON.parse(serializeStockFile(empty))).toEqual(empty)
  })
})

describe('serializeFetchLog', () => {
  it('合法 JSON，且 key 排序固定（git 變更穩定）', () => {
    const log = { entries: { 'b|2': { status: 'success' }, 'a|1': { status: 'nodata' } } }
    const text = serializeFetchLog(log)
    expect(JSON.parse(text)).toEqual(log)
    expect(text.indexOf('a|1')).toBeLessThan(text.indexOf('b|2'))
  })

  it('空紀錄也是合法 JSON', () => {
    expect(JSON.parse(serializeFetchLog({ entries: {} }))).toEqual({ entries: {} })
  })
})

describe('canSkip：中斷後接續的判斷', () => {
  const today = '2026-09-23'

  it('沒紀錄 → 要抓', () => {
    expect(canSkip(undefined, '2026-09-01', 'h1', today)).toBe(false)
  })

  it('成功過且追蹤池相同 → 跳過', () => {
    expect(canSkip({ status: 'success', watchlist_hash: 'h1' }, '2026-09-01', 'h1', today)).toBe(true)
  })

  it('成功過但追蹤池變了 → 重抓（新加入的股票才補得到歷史資料）', () => {
    expect(canSkip({ status: 'success', watchlist_hash: 'h1' }, '2026-09-01', 'h2', today)).toBe(false)
  })

  it('失敗過 → 重抓', () => {
    expect(canSkip({ status: 'failed', watchlist_hash: 'h1' }, '2026-09-01', 'h1', today)).toBe(false)
  })

  it('很久以前那天證交所說沒資料 → 是假日，跳過（不管追蹤池）', () => {
    expect(canSkip({ status: 'nodata', watchlist_hash: 'old' }, '2026-09-01', 'new', today)).toBe(true)
  })

  it('最近幾天證交所說沒資料 → 可能只是還沒公告，要重抓', () => {
    expect(canSkip({ status: 'nodata' }, '2026-09-22', 'h1', today)).toBe(false)
  })
})

describe('createStore：實際讀寫檔案', () => {
  let dir

  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'store-')) })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('寫入追蹤清單後讀得回來，並依代號排序', () => {
    const store = createStore(dir)
    store.writeWatchlist([
      { stock_id: '3008', name: '大立光', market: 'twse' },
      { stock_id: '0050', name: '元大台灣50', market: 'twse' }
    ])
    expect(store.readWatchlist().map((s) => s.stock_id)).toEqual(['0050', '3008'])
  })

  it('沒有追蹤清單檔時回傳空陣列', () => {
    expect(createStore(dir).readWatchlist()).toEqual([])
  })

  it('upsert 之後要 flush 才會寫檔', () => {
    const store = createStore(dir)
    store.upsertRows('3008', 'prices', [{ stock_id: '3008', date: '2026-09-22', close: 2000 }])
    expect(existsSync(join(dir, 'stocks', '3008.json'))).toBe(false)
    store.flush()
    expect(existsSync(join(dir, 'stocks', '3008.json'))).toBe(true)
  })

  it('寫進檔案的資料列不含 stock_id', () => {
    const store = createStore(dir)
    store.upsertRows('3008', 'prices', [{ stock_id: '3008', date: '2026-09-22', close: 2000 }])
    store.flush()
    const saved = JSON.parse(readFileSync(join(dir, 'stocks', '3008.json'), 'utf8'))
    expect(saved.prices[0]).toEqual({ date: '2026-09-22', close: 2000 })
    expect(saved.stock_id).toBe('3008')
  })

  it('換一個 store 重新讀，資料還在（真的寫進磁碟了）', () => {
    const a = createStore(dir)
    a.setStockInfo('3008', { name: '大立光', market: 'twse' })
    a.upsertRows('3008', 'margin', [{ date: '2026-09-22', margin_balance: 1000, short_balance: 0 }])
    a.flush()

    const b = createStore(dir)
    const data = b.readStock('3008')
    expect(data.name).toBe('大立光')
    expect(data.margin).toHaveLength(1)
  })

  it('抓取紀錄寫得進去也讀得回來', () => {
    const a = createStore(dir)
    a.setLogEntry('TWSE_T86', '2026-09-22', { status: 'success', watchlist_hash: 'h1', row_count: 8 })
    a.flush()

    const b = createStore(dir)
    const entry = b.getLogEntry('TWSE_T86', '2026-09-22')
    expect(entry.status).toBe('success')
    expect(entry.watchlist_hash).toBe('h1')
    expect(entry.fetched_at).toBeTruthy()
  })

  it('沒有東西改過時 flush 不寫任何檔', () => {
    expect(createStore(dir).flush()).toBe(0)
  })

  it('寫完不會留下 .tmp 暫存檔', () => {
    const store = createStore(dir)
    store.upsertRows('3008', 'prices', [{ date: '2026-09-22', close: 1 }])
    store.setLogEntry('X', '2026-09-22', { status: 'success' })
    store.flush()
    const all = [...readdirSync(dir), ...readdirSync(join(dir, 'stocks'))]
    expect(all.some((f) => f.endsWith('.tmp'))).toBe(false)
  })

  it('手動編輯把 JSON 改壞時，錯誤訊息指出是哪個檔', () => {
    writeFileSync(join(dir, 'watchlist.json'), '{ "stocks": [ 壞掉 ')
    expect(() => createStore(dir).readWatchlist()).toThrow(/watchlist\.json/)
  })

  it('記事本存檔留下的 BOM 不會讓解析失敗', () => {
    writeFileSync(join(dir, 'watchlist.json'), '﻿{"stocks":[{"stock_id":"3008"}]}')
    expect(createStore(dir).readWatchlist()).toEqual([{ stock_id: '3008' }])
  })

  it('不認得的資料種類會丟錯', () => {
    expect(() => createStore(dir).upsertRows('3008', 'bogus', [{ date: 'd' }])).toThrow()
  })

  it('logKey 格式', () => {
    expect(logKey('TWSE_T86', '2026-09-22')).toBe('TWSE_T86|2026-09-22')
  })
})
