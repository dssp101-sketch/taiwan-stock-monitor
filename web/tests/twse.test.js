import { describe, it, expect } from 'vitest'
import {
  parseNumber, parseDailyQuotes, parseInstitutional, parseMargin,
  findTable, isOk, toTwseDate, buildUrl, TWSE_ENDPOINTS,
  publishedInstitutionalNets, computeNets
} from '../src/lib/twse.js'

describe('parseNumber', () => {
  it('去掉千分位逗號', () => {
    expect(parseNumber('31,578,000')).toBe(31578000)
    expect(parseNumber('1,305.00')).toBe(1305)
  })

  it('缺值符號回傳 null，不是 0', () => {
    expect(parseNumber('--')).toBeNull()
    expect(parseNumber('---')).toBeNull()
    expect(parseNumber('')).toBeNull()
    expect(parseNumber('   ')).toBeNull()
  })

  it('0 是有效數值', () => {
    expect(parseNumber('0')).toBe(0)
  })

  it('負數與小數', () => {
    expect(parseNumber('-1,234.56')).toBe(-1234.56)
  })

  it('解析不出數字時回傳 null 而不是 NaN', () => {
    expect(parseNumber('X0.00')).toBeNull()
    expect(parseNumber('不比價')).toBeNull()
    expect(parseNumber(null)).toBeNull()
    expect(parseNumber(undefined)).toBeNull()
  })
})

describe('toTwseDate / buildUrl', () => {
  it('日期轉成證交所要的 YYYYMMDD', () => {
    expect(toTwseDate('2025-09-19')).toBe('20250919')
  })

  it('格式不對就丟錯', () => {
    expect(() => toTwseDate('2025/09/19')).toThrow(TypeError)
    expect(() => toTwseDate('20250919')).toThrow(TypeError)
  })

  it('組出查詢網址', () => {
    const url = buildUrl(TWSE_ENDPOINTS.institutional, {
      date: '20250919', selectType: 'ALLBUT0999', response: 'json'
    })
    expect(url).toContain('twse.com.tw/rwd/zh/fund/T86')
    expect(url).toContain('date=20250919')
  })
})

describe('findTable', () => {
  const json = {
    tables: [
      { title: '其他統計', data: [] },
      { title: '114年09月19日 每日收盤行情(全部(不含權證、牛熊證))', data: [['x']] }
    ]
  }

  it('用標題找表，不寫死索引（證交所的表格順序會變動）', () => {
    expect(findTable(json, ['每日收盤行情'])?.data).toEqual([['x']])
  })

  it('找不到時回傳 null', () => {
    expect(findTable(json, ['不存在的表'])).toBeNull()
    expect(findTable({}, ['每日收盤行情'])).toBeNull()
  })
})

describe('isOk', () => {
  it('證交所用 stat 表示有沒有資料', () => {
    expect(isOk({ stat: 'OK' })).toBe(true)
    expect(isOk({ stat: '很抱歉，沒有符合條件的資料!' })).toBe(false)
  })
})

describe('parseDailyQuotes', () => {
  const json = {
    stat: 'OK',
    tables: [
      { title: '大盤統計資訊', data: [] },
      {
        title: '114年09月19日 每日收盤行情(全部(不含權證、牛熊證))',
        data: [
          // [代號, 名稱, 成交股數, 成交筆數, 成交金額, 開, 高, 低, 收, 漲跌, 價差, ...]
          ['2330', '台積電  ', '31,578,000', '45,678', '41,109,000,000',
           '1,300.00', '1,310.00', '1,295.00', '1,305.00', '<p style=color:red>+</p>', '10.00'],
          ['2317', '鴻海    ', '20,000,000', '12,345', '4,000,000,000',
           '200.00', '202.00', '199.00', '201.00', '<p style=color:red>+</p>', '1.00'],
          ['合計', '', '--', '--', '--', '--', '--', '--', '--', '', '']
        ]
      }
    ]
  }

  it('成交股數單位是「股」，不做任何換算', () => {
    const rows = parseDailyQuotes(json, '2025-09-19')
    expect(rows[0].volume).toBe(31578000)
  })

  it('開高低收對應正確', () => {
    expect(parseDailyQuotes(json, '2025-09-19')[0]).toEqual({
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

  it('跳過合計列之類明顯不是個股的列', () => {
    const ids = parseDailyQuotes(json, '2025-09-19').map((r) => r.stock_id)
    expect(ids).toEqual(['2330', '2317'])
  })

  it('不猜代號格式：5 碼的 ETF 與 6 碼的代號都會保留，篩選交給追蹤池', () => {
    const withEtf = {
      stat: 'OK',
      tables: [{
        title: '每日收盤行情',
        data: [['00878', '國泰永續高股息', '50,000,000', '1', '1,000,000,000',
                '20.00', '20.10', '19.90', '20.05', '', '0.05']]
      }]
    }
    expect(parseDailyQuotes(withEtf, '2025-09-19')[0].stock_id).toBe('00878')
  })

  it('找不到表時回傳空陣列而不是丟錯', () => {
    expect(parseDailyQuotes({ tables: [] }, '2025-09-19')).toEqual([])
  })
})

describe('parseInstitutional', () => {
  // 台積電 2023-01-30 證交所實際公告的數字
  const tsmc2023 = [
    '2330', '台積電',
    '133,236,588', '52,595,539', '80,641,049', // 外資及陸資(不含外資自營商)
    '0', '0', '0',                              // 外資自營商
    '1,032,000', '94,327', '937,673',           // 投信
    '880,408',                                  // 自營商買賣超合計
    '978,000', '537,000', '441,000',            // 自營商(自行買賣)
    '1,227,511', '788,103', '439,408',          // 自營商(避險)
    '82,459,130'                                // 三大法人買賣超
  ]

  it('17 欄格式：六種法人類別各自對應到正確欄位', () => {
    const { rows } = parseInstitutional({ data: [tsmc2023] }, '2023-01-30')
    expect(rows[0]).toEqual({
      stock_id: '2330',
      date: '2023-01-30',
      foreign_investor_buy: 133236588,
      foreign_investor_sell: 52595539,
      foreign_dealer_self_buy: 0,
      foreign_dealer_self_sell: 0,
      investment_trust_buy: 1032000,
      investment_trust_sell: 94327,
      dealer_self_buy: 978000,
      dealer_self_sell: 537000,
      dealer_hedging_buy: 1227511,
      dealer_hedging_sell: 788103
    })
  })

  it('算出來的淨額必須跟證交所公告的淨額一模一樣', () => {
    const { rows } = parseInstitutional({ data: [tsmc2023] }, '2023-01-30')
    const r = rows[0]

    // 資料庫的計算欄位就是這樣算的，這裡先在 JS 驗證一次
    const foreignNet =
      r.foreign_investor_buy + r.foreign_dealer_self_buy -
      r.foreign_investor_sell - r.foreign_dealer_self_sell
    const trustNet = r.investment_trust_buy - r.investment_trust_sell
    const dealerNet =
      r.dealer_self_buy + r.dealer_hedging_buy -
      r.dealer_self_sell - r.dealer_hedging_sell

    expect(foreignNet).toBe(80641049)   // 證交所公告的外資買賣超
    expect(trustNet).toBe(937673)       // 證交所公告的投信買賣超
    expect(dealerNet).toBe(880408)      // 證交所公告的自營商買賣超合計
    expect(foreignNet + trustNet + dealerNet).toBe(82459130) // 三大法人合計
  })

  it('不把自營商合計欄位也存進去，避免重複計算', () => {
    const { rows } = parseInstitutional({ data: [tsmc2023] }, '2023-01-30')
    expect(rows[0].dealer_buy).toBeUndefined()
    expect(rows[0].dealer_sell).toBeUndefined()
  })

  it('14 欄格式（較早年代，外資未拆出外資自營商）', () => {
    const row = ['2330', '台積電',
      '100', '40', '60',      // 外資及陸資
      '20', '5', '15',        // 投信
      '7',                    // 自營商合計
      '10', '5', '5',         // 自營商(自行買賣)
      '4', '2', '2',          // 自營商(避險)
      '82']                   // 三大法人
    const { rows, unknownShapes } = parseInstitutional({ data: [row] }, '2018-01-02')
    expect(unknownShapes).toEqual([])
    expect(rows[0].foreign_investor_buy).toBe(100)
    expect(rows[0].dealer_self_buy).toBe(10)
    expect(rows[0].dealer_hedging_buy).toBe(4)
    expect(rows[0].foreign_dealer_self_buy).toBeUndefined()
  })

  it('10 欄格式（最早年代，自營商未拆）', () => {
    const row = ['2330', '台積電', '100', '40', '60', '20', '5', '15', '9', '3', '6', '81']
    const { rows } = parseInstitutional({ data: [row.slice(0, 12)] }, '2014-01-02')
    expect(rows[0].dealer_buy).toBe(9)
    expect(rows[0].dealer_sell).toBe(3)
    expect(rows[0].dealer_self_buy).toBeUndefined()
  })

  it('沒看過的欄位數量會被回報，而不是猜著解析', () => {
    const { rows, unknownShapes } = parseInstitutional(
      { data: [['2330', '台積電', '1', '2', '3']] },
      '2025-09-19'
    )
    expect(rows).toEqual([])
    expect(unknownShapes).toEqual([3])
  })

  it('沒有 data 時回傳空結果', () => {
    expect(parseInstitutional({}, '2025-09-19')).toEqual({ rows: [], unknownShapes: [] })
  })
})

describe('parseMargin', () => {
  const json = {
    stat: 'OK',
    tables: [
      // 證交所的回應裡彙總表排在個股明細表前面，標題含有同樣的關鍵字。
      // 只取第一個符合的會抓到這張空的彙總表。
      { title: '融資融券交易統計', data: [['融資', '500', '400']] },
      {
        title: '114年09月19日 融資融券彙總',
        data: [
          // [代號, 名稱, 融資:買進/賣出/現償/前餘/今餘/限額, 融券:買進/賣出/現償/前餘/今餘/限額, 資券互抵, 註記]
          ['2330', '台積電',
           '500', '400', '10', '2,300', '2,390', '999,999',
           '20', '30', '5', '130', '135', '999,999', '3', ''],
          ['2317', '鴻海',
           '--', '--', '--', '--', '--', '--',
           '--', '--', '--', '--', '--', '--', '--', '']
        ]
      }
    ]
  }

  it('⚠️ 證交所的融資融券單位是「張」，必須換算成「股」才寫進資料庫', () => {
    const rows = parseMargin(json, '2025-09-19')
    expect(rows[0].margin_balance).toBe(2390 * 1000) // 2,390 張 = 2,390,000 股
    expect(rows[0].short_balance).toBe(135 * 1000)   //   135 張 =   135,000 股
  })

  it('取的是「今日餘額」而不是前日餘額', () => {
    const rows = parseMargin(json, '2025-09-19')
    expect(rows[0].margin_balance).not.toBe(2300 * 1000)
    expect(rows[0].short_balance).not.toBe(130 * 1000)
  })

  it('缺值維持 null，不會變成 0 股', () => {
    const rows = parseMargin(json, '2025-09-19')
    expect(rows[1].margin_balance).toBeNull()
    expect(rows[1].short_balance).toBeNull()
  })

  it('找不到表時回傳空陣列', () => {
    expect(parseMargin({ tables: [] }, '2025-09-19')).toEqual([])
  })
})

describe('對帳：自己算的淨額 vs 證交所公告的淨額', () => {
  // 台積電 2023-01-30 證交所實際公告，同時含各分項與淨額欄位
  const tsmc2023 = [
    '2330', '台積電',
    '133,236,588', '52,595,539', '80,641,049',
    '0', '0', '0',
    '1,032,000', '94,327', '937,673',
    '880,408',
    '978,000', '537,000', '441,000',
    '1,227,511', '788,103', '439,408',
    '82,459,130'
  ]

  it('取出證交所公告的淨額欄位', () => {
    const nets = publishedInstitutionalNets({ data: [tsmc2023] })
    expect(nets.get('2330')).toEqual({
      foreign: 80641049,  // 外資及陸資 + 外資自營商
      trust: 937673,
      dealer: 880408,
      total: 82459130
    })
  })

  it('從分項算出的淨額，與證交所公告的淨額完全相同', () => {
    const { rows } = parseInstitutional({ data: [tsmc2023] }, '2023-01-30')
    const mine = computeNets(rows[0])
    const published = publishedInstitutionalNets({ data: [tsmc2023] }).get('2330')
    expect(mine).toEqual(published)
  })

  it('欄位位置抓錯時對帳會失敗（確認這個檢查真的有效）', () => {
    // 故意把自營商的買進換成外資自營商的位置，模擬子字串比對抓錯的經典 bug
    const broken = { ...parseInstitutional({ data: [tsmc2023] }, '2023-01-30').rows[0] }
    broken.dealer_self_buy = broken.foreign_dealer_self_buy // 0
    const published = publishedInstitutionalNets({ data: [tsmc2023] }).get('2330')
    expect(computeNets(broken)).not.toEqual(published)
  })

  it('14 欄與 10 欄格式也取得到公告淨額', () => {
    const r14 = ['2330', '台積電', '100', '40', '60', '20', '5', '15', '7',
                 '10', '5', '5', '4', '2', '2', '82']
    expect(publishedInstitutionalNets({ data: [r14] }).get('2330')).toEqual({
      foreign: 60, trust: 15, dealer: 7, total: 82
    })

    const r10 = ['2330', '台積電', '100', '40', '60', '20', '5', '15', '9', '3', '6', '81']
    expect(publishedInstitutionalNets({ data: [r10] }).get('2330')).toEqual({
      foreign: 60, trust: 15, dealer: 6, total: 81
    })
  })

  it('computeNets 把缺值當成 0 參與加總，不會回傳 NaN', () => {
    expect(computeNets({ foreign_investor_buy: 100 })).toEqual({
      foreign: 100, trust: 0, dealer: 0, total: 100
    })
  })
})
