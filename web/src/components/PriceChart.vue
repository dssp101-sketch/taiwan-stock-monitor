<script setup>
/**
 * 主圖：K 線 + 均線 + 成交量。
 *
 * 使用 TradingView lightweight-charts（Apache-2.0）。
 * 依授權要求，圖上開啟 attributionLogo，頁面另外附上 NOTICE 標示。
 */
import { ref, shallowRef, watch, onMounted, onBeforeUnmount } from 'vue'
import { createChart, CandlestickSeries, HistogramSeries, LineSeries } from 'lightweight-charts'
import { toCandles, toVolumeBars, toLine, UP_COLOR, DOWN_COLOR } from '../lib/chartData.js'
import { sma } from '../indicators/index.js'
import DataNotice from './DataNotice.vue'

const props = defineProps({
  /** 已經過 cleanDailyPrices 處理的日 K 陣列 */
  rows: { type: Array, default: () => [] },
  /** 要疊加的均線週期 */
  maPeriods: { type: Array, default: () => [5, 20, 60] },
  height: { type: Number, default: 420 }
})

const MA_COLORS = ['#2563eb', '#ea580c', '#7c3aed', '#0891b2']

const container = ref(null)
const chart = shallowRef(null)
const series = shallowRef({ candle: null, volume: null, mas: [] })

function build() {
  if (!container.value || props.rows.length === 0) return

  chart.value = createChart(container.value, {
    height: props.height,
    layout: {
      background: { color: '#ffffff' },
      textColor: '#3f3f46',
      attributionLogo: true // lightweight-charts 授權要求的 TradingView 連結
    },
    grid: {
      vertLines: { color: '#f4f4f5' },
      horzLines: { color: '#f4f4f5' }
    },
    rightPriceScale: { borderColor: '#e4e4e7' },
    timeScale: { borderColor: '#e4e4e7', rightOffset: 5 },
    crosshair: { mode: 1 },
    localization: {
      locale: 'zh-TW',
      priceFormatter: (p) => p.toFixed(2)
    }
  })

  const candle = chart.value.addSeries(CandlestickSeries, {
    upColor: UP_COLOR,
    downColor: DOWN_COLOR,
    borderUpColor: UP_COLOR,
    borderDownColor: DOWN_COLOR,
    wickUpColor: UP_COLOR,
    wickDownColor: DOWN_COLOR
  })
  candle.setData(toCandles(props.rows))

  // 均線疊在主圖上
  const dates = props.rows.map((r) => r.date)
  const closes = props.rows.map((r) => r.close)
  const mas = props.maPeriods.map((period, i) => {
    const line = chart.value.addSeries(LineSeries, {
      color: MA_COLORS[i % MA_COLORS.length],
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      title: `MA${period}`
    })
    line.setData(toLine(dates, sma(closes, period)))
    return line
  })

  // 成交量放在第二個 pane，避免跟價格擠在同一個座標軸
  const volume = chart.value.addSeries(
    HistogramSeries,
    {
      priceFormat: { type: 'volume' },
      priceScaleId: ''
    },
    1
  )
  volume.setData(toVolumeBars(props.rows))
  chart.value.panes()[1]?.setHeight(Math.round(props.height * 0.25))

  chart.value.timeScale().fitContent()
  series.value = { candle, volume, mas }
}

function destroy() {
  chart.value?.remove()
  chart.value = null
  series.value = { candle: null, volume: null, mas: [] }
}

function rebuild() {
  destroy()
  build()
}

let observer = null

onMounted(() => {
  build()
  if (container.value && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => {
      if (chart.value && container.value) {
        chart.value.applyOptions({ width: container.value.clientWidth })
      }
    })
    observer.observe(container.value)
  }
})

onBeforeUnmount(() => {
  observer?.disconnect()
  destroy()
})

watch(() => props.rows, rebuild)
watch(() => props.maPeriods, rebuild, { deep: true })
</script>

<template>
  <div class="price-chart">
    <DataNotice
      v-if="rows.length === 0"
      message="沒有可顯示的日 K 資料"
      detail="資料庫裡查無這檔股票的價格，或全部都是無成交日"
    />
    <div v-else ref="container" class="canvas" data-testid="price-chart"></div>
    <p v-if="rows.length" class="legend">
      <span v-for="(p, i) in maPeriods" :key="p" :style="{ color: MA_COLORS[i % MA_COLORS.length] }">
        MA{{ p }}
      </span>
      <span class="hint">下方為成交量（單位：股）</span>
    </p>
  </div>
</template>

<style scoped>
.price-chart { width: 100%; }
.canvas { width: 100%; }
.legend {
  display: flex;
  gap: 0.75rem;
  margin: 0.4rem 0 0;
  font-size: 0.78rem;
}
.hint { margin-left: auto; color: #a1a1aa; }
</style>
