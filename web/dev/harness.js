import { createApp, h, ref } from 'vue'
import PriceChart from '../src/components/PriceChart.vue'
import IndicatorChart from '../src/components/IndicatorChart.vue'
import InstitutionalTable from '../src/components/InstitutionalTable.vue'
import DataNotice from '../src/components/DataNotice.vue'
import { makePriceRows, makeFlowRows } from './fixture.js'

const rows = makePriceRows()
const flows = makeFlowRows(rows)
const shortRows = rows.slice(-5) // 故意給不足的資料，驗證「資料不足」的路徑

createApp({
  setup() {
    const ready = ref(false)
    // 讓 Playwright 知道圖表已經掛好
    requestAnimationFrame(() => requestAnimationFrame(() => { ready.value = true }))
    return () =>
      h('div', { class: 'harness', 'data-ready': ready.value ? '1' : '0' }, [
        h('div', { class: 'banner' },
          '⚠️ 開發用視覺測試頁。以下全部是固定種子產生的測試序列，不是真實行情。'),

        h('h2', `主圖：K 線 + 均線 + 成交量（${rows.length} 個交易日）`),
        h(PriceChart, { rows }),

        h('h2', '副圖'),
        h(IndicatorChart, { rows, type: 'macd' }),
        h(IndicatorChart, { rows, type: 'kd' }),
        h(IndicatorChart, { rows, type: 'rsi' }),

        h('h2', '三大法人'),
        h(InstitutionalTable, { rows: flows, days: 10 }),

        h('h2', '資料不足時的樣子'),
        h('p', { class: 'note' }, '只給 5 個交易日，指標算不出來時不應該補值，而是顯示「資料不足」：'),
        h(IndicatorChart, { rows: shortRows, type: 'macd' }),
        h('p', { class: 'note' }, '完全沒有資料時：'),
        h(PriceChart, { rows: [] }),
        h(InstitutionalTable, { rows: [], days: 10 }),
        h(DataNotice, { state: 'error', message: '模擬的讀取失敗訊息' })
      ])
  }
}).mount('#app')
