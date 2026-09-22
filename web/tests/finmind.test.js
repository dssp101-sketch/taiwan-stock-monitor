import { describe, it, expect } from 'vitest'
import {
  mapStockInfo,
  mapPrice,
  mapMargin,
  pivotInstitutional,
  marketLabel,
  INSTITUTIONAL_CATEGORIES
} from '../src/lib/finmind.js'

describe('mapStockInfo', () => {
  it('對應 TaiwanStockInfo 的四個欄位', () => {
    expect(
      mapStockInfo({
        industry_category: 'Semiconductor',
        stock_id: '2330',
        stock_name: '台積電',
        type: 'twse'
      })
    ).toEqual({ stock_id: '2330', name: '台積電', industry: 'Semiconductor', market: 'twse' })
  })

  it('市場別存原始值 twse / tpex，不在寫入時轉成中文', () => {
    expect(mapStockInfo({ stock_id: '6488', stock_name: '環球晶', type: 'tpex' }).market).toBe('tpex')
  })

  it('沒有 stock_id 時回傳 null', () => {
    expect(mapStockInfo({ stock_name: '無代號' })).toBeNull()
    expect(mapStockInfo(null)).toBeNull()
  })
})

describe('marketLabel', () => {
  it('已知代碼轉成中文', () => {
    expect(marketLabel('twse')).toBe('上市')
    expect(marketLabel('tpex')).toBe('上櫃')
    expect(marketLabel('emerging')).toBe('興櫃')
  })

  it('沒看過的代碼原樣顯示，不隱藏也不亂猜', () => {
    expect(marketLabel('something_new')).toBe('something_new')
  })

  it('空值回傳 null', () => {
    expect(marketLabel(null)).toBeNull()
    expect(marketLabel('')).toBeNull()
  })
})

describe('mapPrice', () => {
  const finmindRow = {
    date: '2025-09-19',
    stock_id: '2330',
    Trading_Volume: 31578000,
    Trading_money: 41109000000,
    open: 1300,
    max: 1310,
    min: 1295,
    close: 1305,
    spread: 5,
    Trading_turnover: 45678
  }

  it('max 對到 high、min 對到 low（這是最容易寫錯的地方）', () => {
    const r = mapPrice(finmindRow)
    expect(r.high).toBe(1310)
    expect(r.low).toBe(1295)
  })

  it('Trading_Volume 對到 volume、Trading_money 對到 turnover', () => {
    const r = mapPrice(finmindRow)
    expect(r.volume).toBe(31578000)
    expect(r.turnover).toBe(41109000000)
  })

  it('成交量保持「股」，不在寫入時偷偷除以 1000', () => {
    expect(mapPrice(finmindRow).volume).toBe(31578000)
  })

  it('完整對應結果', () => {
    expect(mapPrice(finmindRow)).toEqual({
      stock_id: '2330',
      date: '2025-09-19',
      open: 1300,
      high: 1310,
      low: 1295,
      close: 1305,
      volume: 31578000,
      turnover: 41109000000
    })
  })

  it('無成交日的 0 照實存，不在寫入階段過濾（過濾是計算階段的事）', () => {
    const r = mapPrice({ ...finmindRow, open: 0, max: 0, min: 0, close: 0, Trading_Volume: 0 })
    expect(r.close).toBe(0)
    expect(r.volume).toBe(0)
  })

  it('缺欄位回傳 null 而不是 0', () => {
    const r = mapPrice({ date: '2025-09-19', stock_id: '2330' })
    expect(r.close).toBeNull()
    expect(r.volume).toBeNull()
  })

  it('日期格式不對就整筆回傳 null', () => {
    expect(mapPrice({ ...finmindRow, date: '2025/09/19' })).toBeNull()
    expect(mapPrice({ ...finmindRow, date: null })).toBeNull()
  })

  it('帶時間的日期會被截成 YYYY-MM-DD', () => {
    expect(mapPrice({ ...finmindRow, date: '2025-09-19 00:00:00' }).date).toBe('2025-09-19')
  })
})

describe('mapMargin', () => {
  it('只取今日餘額兩個欄位', () => {
    expect(
      mapMargin({
        date: '2025-09-19',
        stock_id: '2330',
        MarginPurchaseBuy: 1000,
        MarginPurchaseTodayBalance: 2345,
        MarginPurchaseYesterdayBalance: 2300,
        ShortSaleTodayBalance: 128,
        ShortSaleYesterdayBalance: 130,
        Note: ''
      })
    ).toEqual({
      stock_id: '2330',
      date: '2025-09-19',
      margin_balance: 2345,
      short_balance: 128
    })
  })

  it('缺欄位回傳 null', () => {
    const r = mapMargin({ date: '2025-09-19', stock_id: '2330' })
    expect(r.margin_balance).toBeNull()
    expect(r.short_balance).toBeNull()
  })
})

describe('pivotInstitutional', () => {
  const long = [
    { date: '2025-09-19', stock_id: '2330', name: 'Foreign_Investor', buy: 5000000, sell: 3500000 },
    { date: '2025-09-19', stock_id: '2330', name: 'Foreign_Dealer_Self', buy: 120000, sell: 80000 },
    { date: '2025-09-19', stock_id: '2330', name: 'Investment_Trust', buy: 800000, sell: 200000 },
    { date: '2025-09-19', stock_id: '2330', name: 'Dealer_self', buy: 100000, sell: 450000 },
    { date: '2025-09-19', stock_id: '2330', name: 'Dealer_Hedging', buy: 300000, sell: 250000 }
  ]

  it('把長表攤平成一天一列', () => {
    const { rows } = pivotInstitutional(long)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      stock_id: '2330',
      date: '2025-09-19',
      foreign_investor_buy: 5000000,
      foreign_investor_sell: 3500000,
      foreign_dealer_self_buy: 120000,
      foreign_dealer_self_sell: 80000,
      investment_trust_buy: 800000,
      investment_trust_sell: 200000,
      dealer_self_buy: 100000,
      dealer_self_sell: 450000,
      dealer_hedging_buy: 300000,
      dealer_hedging_sell: 250000
    })
  })

  it('不同日期、不同股票各自成列', () => {
    const { rows } = pivotInstitutional([
      ...long,
      { date: '2025-09-22', stock_id: '2330', name: 'Foreign_Investor', buy: 1, sell: 2 },
      { date: '2025-09-19', stock_id: '2317', name: 'Foreign_Investor', buy: 3, sell: 4 }
    ])
    expect(rows).toHaveLength(3)
    const keys = rows.map((r) => `${r.stock_id}/${r.date}`).sort()
    expect(keys).toEqual(['2317/2025-09-19', '2330/2025-09-19', '2330/2025-09-22'])
  })

  it('六種法人類別都認得', () => {
    expect(Object.keys(INSTITUTIONAL_CATEGORIES)).toEqual([
      'Foreign_Investor',
      'Foreign_Dealer_Self',
      'Investment_Trust',
      'Dealer_self',
      'Dealer_Hedging',
      'Dealer'
    ])
  })

  it('沒看過的類別會被回報出來，不會靜默丟掉', () => {
    const { rows, unknownCategories, skipped } = pivotInstitutional([
      ...long,
      { date: '2025-09-19', stock_id: '2330', name: 'Brand_New_Category', buy: 1, sell: 2 }
    ])
    expect(unknownCategories).toEqual(['Brand_New_Category'])
    expect(skipped).toBe(1)
    expect(rows[0].foreign_investor_buy).toBe(5000000) // 其他類別不受影響
  })

  it('同一天同一類別重複出現時累加，不是後蓋前', () => {
    const { rows } = pivotInstitutional([
      { date: '2025-09-19', stock_id: '2330', name: 'Dealer_self', buy: 100, sell: 50 },
      { date: '2025-09-19', stock_id: '2330', name: 'Dealer_self', buy: 200, sell: 30 }
    ])
    expect(rows[0].dealer_self_buy).toBe(300)
    expect(rows[0].dealer_self_sell).toBe(80)
  })

  it('舊制只有 Dealer 合併欄位時也能處理', () => {
    const { rows, unknownCategories } = pivotInstitutional([
      { date: '2015-01-05', stock_id: '2330', name: 'Dealer', buy: 1000, sell: 2000 }
    ])
    expect(rows[0].dealer_buy).toBe(1000)
    expect(rows[0].dealer_sell).toBe(2000)
    expect(unknownCategories).toEqual([])
  })

  it('缺 date 或 stock_id 的列被跳過並計數', () => {
    const { rows, skipped } = pivotInstitutional([
      { date: '2025-09-19', name: 'Foreign_Investor', buy: 1, sell: 2 },
      { stock_id: '2330', name: 'Foreign_Investor', buy: 1, sell: 2 }
    ])
    expect(rows).toHaveLength(0)
    expect(skipped).toBe(2)
  })

  it('空陣列回傳空結果', () => {
    expect(pivotInstitutional([])).toEqual({ rows: [], unknownCategories: [], skipped: 0 })
  })

  it('傳入非陣列會丟錯', () => {
    expect(() => pivotInstitutional(null)).toThrow(TypeError)
  })
})
