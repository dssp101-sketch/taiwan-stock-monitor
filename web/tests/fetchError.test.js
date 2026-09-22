import { describe, it, expect } from 'vitest'
import { describeFetchError } from '../scripts/fetchError.js'

/** 模擬 Node fetch 的錯誤結構：外層 message 永遠是 'fetch failed'，原因在 cause 裡。 */
function fetchFailed(cause) {
  const err = new TypeError('fetch failed')
  err.cause = cause
  return err
}

function sysError(code, message = code) {
  const e = new Error(message)
  e.code = code
  return e
}

describe('describeFetchError', () => {
  it('把藏在 cause 裡的錯誤代碼挖出來', () => {
    const out = describeFetchError(fetchFailed(sysError('ECONNRESET')))
    expect(out).toContain('ECONNRESET')
    expect(out).not.toBe('fetch failed')
  })

  it('連線被重設時提示可能被證交所限流', () => {
    const out = describeFetchError(fetchFailed(sysError('ECONNRESET')))
    expect(out).toContain('等 10 分鐘')
  })

  it('DNS 失敗時提示檢查網路', () => {
    expect(describeFetchError(fetchFailed(sysError('ENOTFOUND')))).toContain('DNS')
  })

  it('逾時時提示檢查 VPN', () => {
    expect(describeFetchError(fetchFailed(sysError('UND_ERR_CONNECT_TIMEOUT')))).toContain('VPN')
  })

  it('憑證問題時提示檢查系統時間', () => {
    expect(describeFetchError(fetchFailed(sysError('CERT_HAS_EXPIRED')))).toContain('系統時間')
  })

  it('多層巢狀的 cause 也挖得到', () => {
    const inner = sysError('ECONNRESET')
    const middle = new Error('socket hang up')
    middle.cause = inner
    const out = describeFetchError(fetchFailed(middle))
    expect(out).toContain('socket hang up')
    expect(out).toContain('ECONNRESET')
  })

  it('沒看過的錯誤代碼照樣印出來，只是沒有建議', () => {
    const out = describeFetchError(fetchFailed(sysError('ESOMETHINGNEW')))
    expect(out).toContain('ESOMETHINGNEW')
    expect(out).not.toContain('→')
  })

  it('完全沒有 cause 時明說沒有更多資訊，而不是印空字串', () => {
    expect(describeFetchError(new TypeError('fetch failed'))).toContain('沒有更多資訊')
  })

  it('不會因為循環或過深的 cause 而卡住', () => {
    const a = new Error('a')
    const b = new Error('b')
    a.cause = b
    b.cause = a
    expect(() => describeFetchError(a)).not.toThrow()
  })
})
