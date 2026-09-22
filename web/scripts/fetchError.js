/**
 * 把 fetch 的錯誤講清楚。
 *
 * Node 的 fetch 失敗時 message 永遠是 'fetch failed'，完全看不出原因。
 * 真正的原因放在 err.cause 裡（可能再往下巢狀一層），要自己挖出來。
 */
export function describeFetchError(err) {
  const chain = []
  let cur = err
  for (let i = 0; i < 5 && cur; i++) {
    const code = cur.code ?? cur.errno
    const msg = cur.message
    if (code) chain.push(String(code))
    else if (msg && msg !== 'fetch failed') chain.push(msg)
    cur = cur.cause
  }

  const detail = chain.length ? chain.join(' ← ') : 'fetch failed（沒有更多資訊）'

  // 針對常見的錯誤代碼給出具體建議
  const hints = {
    ENOTFOUND: 'DNS 查不到 www.twse.com.tw。檢查網路連線或 DNS 設定。',
    EAI_AGAIN: 'DNS 暫時查詢失敗，通常是網路不穩，稍後再試。',
    ECONNRESET: '連線被對方重設。證交所可能因為短時間請求太多而擋你，等 10 分鐘再試。',
    ECONNREFUSED: '連線被拒絕。檢查是否有防火牆、VPN 或 Proxy 擋住。',
    ETIMEDOUT: '連線逾時。網路太慢或被防火牆丟棄，檢查 VPN 設定。',
    UND_ERR_CONNECT_TIMEOUT: '建立連線逾時。檢查網路、VPN 或公司防火牆。',
    UND_ERR_SOCKET: '連線中斷。證交所可能擋下了大量請求，等 10 分鐘再試。',
    CERT_HAS_EXPIRED: '憑證過期。檢查電腦的系統時間是否正確。',
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: '無法驗證憑證，通常是公司網路的中間人代理造成的。'
  }
  const hint = chain.map((c) => hints[c]).find(Boolean)

  return hint ? `${detail}\n   → ${hint}` : detail
}
