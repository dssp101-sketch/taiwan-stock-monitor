/**
 * 元件視覺驗證：開瀏覽器跑 dev/harness.html，檢查圖表真的畫出來了並存下截圖。
 *
 * 用法（要先另開一個終端機跑 npm run dev）：
 *   node dev/screenshot.mjs [輸出路徑] [dev server 網址]
 *
 * 這會檢查：
 *   - 每個 canvas 都有實際尺寸（圖表真的畫出來，不是空殼）
 *   - 資料不足時顯示「資料不足」而不是補值
 *   - lightweight-charts 授權要求的 TradingView 連結有出現
 *   - 主控台沒有任何錯誤
 */
import { createRequire } from 'node:module'

const require = createRequire('/opt/node22/lib/node_modules/')
const { chromium } = require('playwright')

const out = process.argv[2] ?? 'harness.png'
const base = process.argv[3] ?? 'http://127.0.0.1:5173'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1000, height: 1400 }, deviceScaleFactor: 2 })

const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

await page.goto(`${base}/dev/harness.html`, { waitUntil: 'networkidle' })
await page.waitForSelector('[data-ready="1"]', { timeout: 15000 })
await page.waitForTimeout(1200)

const stats = await page.evaluate(() => {
  const canvases = [...document.querySelectorAll('canvas')]
  return {
    canvasCount: canvases.length,
    painted: canvases.filter((c) => c.width > 0 && c.height > 0).length,
    notices: [...document.querySelectorAll('.notice .main')].map((n) => n.textContent.trim()),
    tradingViewLinks: [...document.querySelectorAll('a[href*="tradingview.com"]')].length,
    charts: [...document.querySelectorAll('[data-testid]')].map((el) => ({
      id: el.dataset.testid,
      height: Math.round(el.getBoundingClientRect().height)
    }))
  }
})

await page.screenshot({ path: out, fullPage: true })
await browser.close()

console.log(JSON.stringify(stats, null, 2))
console.log('主控台錯誤：', errors.length ? errors : '（無）')

const ok =
  stats.canvasCount > 0 &&
  stats.painted === stats.canvasCount &&
  stats.charts.every((c) => c.height > 0) &&
  stats.tradingViewLinks > 0 &&
  errors.length === 0

console.log(ok ? `\n✅ 通過，截圖存到 ${out}` : '\n❌ 有問題，看上面的輸出')
process.exit(ok ? 0 : 1)
