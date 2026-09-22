<script setup>
/**
 * 個股頁：主圖 + 三個副圖 + 三大法人明細。
 *
 * 資料只從自己的 Supabase 讀，不直接呼叫 FinMind。
 */
import { ref, computed, watch, onMounted } from 'vue'
import { supabase, isConfigured } from '../lib/supabase.js'
import { cleanDailyPrices } from '../lib/priceSeries.js'
import { marketLabel } from '../lib/finmind.js'
import PriceChart from '../components/PriceChart.vue'
import IndicatorChart from '../components/IndicatorChart.vue'
import InstitutionalTable from '../components/InstitutionalTable.vue'
import DataNotice from '../components/DataNotice.vue'

const props = defineProps({
  stockId: { type: String, required: true },
  /** 往回取幾天的日 K */
  lookbackDays: { type: Number, default: 400 }
})

const loading = ref(false)
const error = ref('')
const stock = ref(null)
const priceRows = ref([])
const excludedRows = ref(0)
const flowRows = ref([])

const marketText = computed(() => marketLabel(stock.value?.market))

async function load() {
  if (!isConfigured) return
  loading.value = true
  error.value = ''
  try {
    const since = new Date()
    since.setUTCDate(since.getUTCDate() - props.lookbackDays)
    const sinceStr = since.toISOString().slice(0, 10)

    const [stockRes, priceRes, flowRes] = await Promise.all([
      supabase.from('stocks').select('*').eq('stock_id', props.stockId).maybeSingle(),
      supabase
        .from('daily_prices')
        .select('date, open, high, low, close, volume')
        .eq('stock_id', props.stockId)
        .gte('date', sinceStr)
        .order('date'),
      supabase
        .from('institutional_flows')
        .select('date, foreign_net, trust_net, dealer_net, total_net')
        .eq('stock_id', props.stockId)
        .gte('date', sinceStr)
        .order('date')
    ])

    const firstError = stockRes.error || priceRes.error || flowRes.error
    if (firstError) throw new Error(firstError.message)

    stock.value = stockRes.data
    // 價格欄位是 numeric，supabase-js 可能回傳字串，這裡統一轉成數字
    const raw = (priceRes.data ?? []).map((r) => ({
      date: r.date,
      open: r.open === null ? null : Number(r.open),
      high: r.high === null ? null : Number(r.high),
      low: r.low === null ? null : Number(r.low),
      close: r.close === null ? null : Number(r.close),
      volume: r.volume === null ? null : Number(r.volume)
    }))
    const cleaned = cleanDailyPrices(raw)
    priceRows.value = cleaned.rows
    excludedRows.value = cleaned.excluded
    flowRows.value = flowRes.data ?? []
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(() => props.stockId, load)
</script>

<template>
  <article class="stock-page">
    <header class="head">
      <h2>
        {{ stockId }}
        <span v-if="stock?.name" class="name">{{ stock.name }}</span>
      </h2>
      <p v-if="stock" class="meta">
        <span v-if="marketText">{{ marketText }}</span>
        <span v-if="stock.industry">{{ stock.industry }}</span>
      </p>
    </header>

    <DataNotice
      v-if="!isConfigured"
      message="尚未設定資料庫連線"
      detail="請設定 VITE_SUPABASE_URL 與 VITE_SUPABASE_ANON_KEY"
    />
    <DataNotice v-else-if="loading" state="loading" />
    <DataNotice v-else-if="error" state="error" :message="error" />

    <template v-else>
      <p v-if="excludedRows > 0" class="excluded">
        已排除 {{ excludedRows }} 筆無成交日（開高低收為 0），這些日期不列入指標計算。
      </p>

      <PriceChart :rows="priceRows" />
      <IndicatorChart :rows="priceRows" type="macd" />
      <IndicatorChart :rows="priceRows" type="kd" />
      <IndicatorChart :rows="priceRows" type="rsi" />

      <InstitutionalTable :rows="flowRows" :days="10" />
      <InstitutionalTable :rows="flowRows" :days="20" />
    </template>

    <footer class="attribution">
      圖表由
      <a href="https://www.tradingview.com/" target="_blank" rel="noopener">TradingView</a>
      的 Lightweight Charts™ 提供（Copyright © 2023 TradingView, Inc.，Apache-2.0 授權）。
    </footer>
  </article>
</template>

<style scoped>
.stock-page { width: 100%; }
.head { margin-bottom: 0.75rem; }
h2 { margin: 0; font-size: 1.25rem; }
.name { margin-left: 0.5rem; color: #52525b; font-weight: 500; }
.meta { display: flex; gap: 0.75rem; margin: 0.2rem 0 0; color: #a1a1aa; font-size: 0.8rem; }
.excluded {
  margin: 0 0 0.6rem;
  padding: 0.4rem 0.6rem;
  border-left: 3px solid #f59e0b;
  background: #fffbeb;
  color: #92400e;
  font-size: 0.8rem;
}
.attribution {
  margin-top: 2rem;
  padding-top: 0.75rem;
  border-top: 1px solid #f4f4f5;
  color: #a1a1aa;
  font-size: 0.72rem;
}
.attribution a { color: #71717a; }
</style>
