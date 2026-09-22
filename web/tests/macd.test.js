import { describe, it, expect } from 'vitest'
import { macd } from '../src/indicators/macd.js'

describe('macd', () => {
  it('手算驗證：快 2 / 慢 3 / 訊號 2，輸入 1..8', () => {
    // EMA2（k=2/3）：索引1 種子 1.5，之後 2.5、3.5、4.5、5.5、6.5、7.5
    // EMA3（k=1/2）：索引2 種子 2，  之後 3、4、5、6、7
    // DIF 從索引2 起固定為 0.5
    // 訊號線是 DIF 的 2 日 EMA，種子需要兩筆 DIF，所以從索引3 才有值，固定 0.5
    // OSC = DIF − 訊號線 = 0
    const { dif, macd: line, osc } = macd([1, 2, 3, 4, 5, 6, 7, 8], 2, 3, 2)

    expect(dif[0]).toBeNull()
    expect(dif[1]).toBeNull()
    for (let i = 2; i <= 7; i++) expect(dif[i]).toBeCloseTo(0.5, 10)

    expect(line[2]).toBeNull()
    for (let i = 3; i <= 7; i++) expect(line[i]).toBeCloseTo(0.5, 10)

    expect(osc[2]).toBeNull()
    for (let i = 3; i <= 7; i++) expect(osc[i]).toBeCloseTo(0, 10)
  })

  it('OSC 恆等於 DIF 減訊號線', () => {
    let seed = 11
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    const values = Array.from({ length: 200 }, () => 100 + rand() * 50)
    const { dif, macd: line, osc } = macd(values)

    osc.forEach((v, i) => {
      if (v === null) {
        expect(line[i]).toBeNull()
      } else {
        expect(v).toBeCloseTo(dif[i] - line[i], 10)
      }
    })
  })

  it('價格完全不動時 DIF、訊號線、OSC 全為 0', () => {
    const values = new Array(60).fill(25)
    const { dif, macd: line, osc } = macd(values)
    expect(dif[59]).toBeCloseTo(0, 10)
    expect(line[59]).toBeCloseTo(0, 10)
    expect(osc[59]).toBeCloseTo(0, 10)
  })

  it('一路上漲時 DIF 為正（快線在慢線之上）', () => {
    const values = Array.from({ length: 80 }, (_, i) => 100 + i)
    const { dif } = macd(values)
    expect(dif[79]).toBeGreaterThan(0)
  })

  it('預設參數 12/26/9 的第一個 DIF 落在索引 25', () => {
    const values = Array.from({ length: 60 }, (_, i) => 100 + (i % 7))
    const { dif } = macd(values)
    expect(dif[24]).toBeNull()
    expect(dif[25]).not.toBeNull()
  })

  it('資料不足時三條線都是 null', () => {
    const { dif, macd: line, osc } = macd([1, 2, 3, 4, 5])
    expect(dif.every((v) => v === null)).toBe(true)
    expect(line.every((v) => v === null)).toBe(true)
    expect(osc.every((v) => v === null)).toBe(true)
  })

  it('快線週期不小於慢線時丟錯', () => {
    expect(() => macd([1, 2, 3], 26, 12)).toThrow(TypeError)
  })
})
