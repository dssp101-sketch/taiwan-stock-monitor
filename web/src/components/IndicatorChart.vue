<script setup>
/**
 * 副圖：MACD／KD／RSI。
 *
 * 只負責畫圖，指標一律由 src/indicators/ 的純函式算好再傳進來的價格算，
 * 這個元件不自己發明任何計算邏輯。
 */
import { ref, shallowRef, watch, onMounted, onBeforeUnmount, computed } from 'vue'
import { createChart, HistogramSeries, LineSeries } from 'lightweight-charts'
import { toLine, toHistogram } from '../lib/chartData.js'
import { macd, kd, rsi } from '../indicators/index.js'
import DataNotice from './DataNotice.vue'

const props = defineProps({
  rows: { type: Array, default: () => [] },
  /** 'macd' | 'kd' | 'rsi' */
  type: { type: String, required: true },
  height: { type: Number, default: 160 }
})

const TITLES = { macd: 'MACD', kd: 'KD', rsi: 'RSI' }
const title = computed(() => TITLES[props.type] ?? props.type)

const container = ref(null)
const chart = shallowRef(null)

/** 算出這個副圖需要的所有線，並回報有沒有足夠資料。 */
function computeSeries() {
  const dates = props.rows.map((r) => r.date)
  const closes = props.rows.map((r) => r.close)
  const highs = props.rows.map((r) => r.high)
  const lows = props.rows.map((r) => r.low)

  if (props.type === 'macd') {
    const m = macd(closes)
    return {
      lines: [
        { name: 'DIF', color: '#2563eb', data: toLine(dates, m.dif) },
        { name: 'MACD', color: '#ea580c', data: toLine(dates, m.macd) }
      ],
      histogram: { name: 'OSC', data: toHistogram(dates, m.osc) },
      guides: [0]
    }
  }

  if (props.type === 'kd') {
    const k = kd(highs, lows, closes)
    return {
      lines: [
        { name: 'K', color: '#2563eb', data: toLine(dates, k.k) },
        { name: 'D', color: '#ea580c', data: toLine(dates, k.d) }
      ],
      histogram: null,
      guides: [20, 80]
    }
  }

  if (props.type === 'rsi') {
    return {
      lines: [{ name: 'RSI(14)', color: '#7c3aed', data: toLine(dates, rsi(closes, 14)) }],
      histogram: null,
      guides: [30, 70]
    }
  }

  throw new Error(`不支援的副圖類型：${props.type}`)
}

const hasData = computed(() => {
  if (props.rows.length === 0) return false
  try {
    const s = computeSeries()
    return s.lines.some((l) => l.data.length > 0) || (s.histogram?.data.length ?? 0) > 0
  } catch {
    return false
  }
})

function build() {
  if (!container.value || !hasData.value) return
  const spec = computeSeries()

  chart.value = createChart(container.value, {
    height: props.height,
    layout: {
      background: { color: '#ffffff' },
      textColor: '#3f3f46',
      attributionLogo: true
    },
    grid: {
      vertLines: { color: '#f4f4f5' },
      horzLines: { color: '#f4f4f5' }
    },
    rightPriceScale: { borderColor: '#e4e4e7' },
    timeScale: { borderColor: '#e4e4e7', rightOffset: 5 },
    crosshair: { mode: 1 },
    localization: { locale: 'zh-TW' }
  })

  if (spec.histogram) {
    const h = chart.value.addSeries(HistogramSeries, { priceLineVisible: false })
    h.setData(spec.histogram.data)
  }

  let first = null
  for (const line of spec.lines) {
    const s = chart.value.addSeries(LineSeries, {
      color: line.color,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      title: line.name
    })
    s.setData(line.data)
    first ??= s
  }

  // 參考線（RSI 30/70、KD 20/80、MACD 0 軸）
  for (const value of spec.guides) {
    first?.createPriceLine({
      price: value,
      color: '#d4d4d8',
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true
    })
  }

  chart.value.timeScale().fitContent()
}

function destroy() {
  chart.value?.remove()
  chart.value = null
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
watch(() => props.type, rebuild)
</script>

<template>
  <section class="indicator">
    <h3>{{ title }}</h3>
    <DataNotice
      v-if="!hasData"
      :message="`${title} 需要的資料筆數不足`"
      detail="指標需要足夠的歷史資料才算得出來，不足的期間不會補值"
    />
    <div v-else ref="container" class="canvas" :data-testid="`indicator-${type}`"></div>
  </section>
</template>

<style scoped>
.indicator { margin-top: 1rem; }
h3 {
  margin: 0 0 0.3rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: #52525b;
}
.canvas { width: 100%; }
</style>
