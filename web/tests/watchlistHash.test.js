import { describe, it, expect } from 'vitest'
import { watchlistHash } from '../scripts/watchlistHash.js'

describe('watchlistHash', () => {
  it('同樣的一組股票得到同樣的雜湊', () => {
    expect(watchlistHash(['2330', '2317'])).toBe(watchlistHash(['2330', '2317']))
  })

  it('順序不影響結果（追蹤池的查詢順序不保證固定）', () => {
    expect(watchlistHash(['2330', '2317', '2454'])).toBe(watchlistHash(['2454', '2330', '2317']))
  })

  it('重複的代號不影響結果', () => {
    expect(watchlistHash(['2330', '2330', '2317'])).toBe(watchlistHash(['2330', '2317']))
  })

  it('多一檔股票就會得到不同的雜湊（這是整個機制的重點）', () => {
    const before = watchlistHash(['2330', '2317'])
    const after = watchlistHash(['2330', '2317', '2454'])
    expect(after).not.toBe(before)
  })

  it('少一檔股票也會得到不同的雜湊', () => {
    expect(watchlistHash(['2330'])).not.toBe(watchlistHash(['2330', '2317']))
  })

  it('換掉一檔但數量相同，雜湊仍然不同（不能只比數量）', () => {
    expect(watchlistHash(['2330', '2317'])).not.toBe(watchlistHash(['2330', '2454']))
  })

  it('前後空白會被正規化掉', () => {
    expect(watchlistHash([' 2330 ', '2317'])).toBe(watchlistHash(['2330', '2317']))
  })

  it('空陣列也能算，不丟錯', () => {
    expect(typeof watchlistHash([])).toBe('string')
    expect(watchlistHash([])).toHaveLength(12)
  })

  it('長度固定 12 碼', () => {
    expect(watchlistHash(['2330'])).toHaveLength(12)
    expect(watchlistHash(Array.from({ length: 50 }, (_, i) => String(1000 + i)))).toHaveLength(12)
  })

  it('傳入非陣列會丟錯', () => {
    expect(() => watchlistHash('2330')).toThrow(TypeError)
    expect(() => watchlistHash(null)).toThrow(TypeError)
  })
})
