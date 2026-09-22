/**
 * 開發用的固定測試序列。
 *
 * ⚠️ 這不是真實行情，只用來檢查圖表元件畫得出來、顏色與排版正確。
 * ⚠️ 這個檔案只被 dev/harness.html 引用，不會出現在正式版打包結果裡
 *    （vite build 只會編譯 index.html）。
 *
 * 正式頁面的資料一律來自 Supabase，資料不足時顯示「資料不足」，
 * 絕不會用這裡的東西填補。
 */

/** 固定種子的 LCG，讓每次產生的序列完全一樣，截圖才能拿來比對。 */
function makeRandom(seed) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

export function makePriceRows(count = 180, seed = 20250922) {
  const rand = makeRandom(seed)
  const rows = []
  let price = 600
  const start = new Date(Date.UTC(2025, 0, 2))

  for (let i = 0; i < count; i++) {
    const d = new Date(start)
    d.setUTCDate(d.getUTCDate() + i)
    const dow = d.getUTCDay()
    if (dow === 0 || dow === 6) continue // 跳過週末

    price = Math.max(50, price * (1 + (rand() - 0.48) * 0.035))
    const open = Math.round(price * (1 + (rand() - 0.5) * 0.01) * 100) / 100
    const close = Math.round(price * 100) / 100
    const high = Math.round(Math.max(open, close) * (1 + rand() * 0.012) * 100) / 100
    const low = Math.round(Math.min(open, close) * (1 - rand() * 0.012) * 100) / 100

    rows.push({
      date: d.toISOString().slice(0, 10),
      open,
      high,
      low,
      close,
      volume: Math.round(15_000_000 + rand() * 40_000_000)
    })
  }
  return rows
}

export function makeFlowRows(priceRows, seed = 777) {
  const rand = makeRandom(seed)
  return priceRows.slice(-25).map((r) => {
    const foreign = Math.round((rand() - 0.5) * 8_000_000)
    const trust = Math.round((rand() - 0.5) * 1_500_000)
    const dealer = Math.round((rand() - 0.5) * 900_000)
    return {
      date: r.date,
      foreign_net: foreign,
      trust_net: trust,
      dealer_net: dealer,
      total_net: foreign + trust + dealer
    }
  })
}
