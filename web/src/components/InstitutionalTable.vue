<script setup>
/**
 * 三大法人近 N 日明細。
 *
 * 資料庫存的是「股」，這裡只在顯示時 ÷1000 換算成「張」。
 * 資料不足的格子顯示「—」，絕不填 0。
 */
import { computed } from 'vue'
import { sharesToLots } from '../lib/units.js'
import DataNotice from './DataNotice.vue'

const props = defineProps({
  /** institutional_flows 查詢結果，日期由舊到新 */
  rows: { type: Array, default: () => [] },
  /** 只顯示最近幾日 */
  days: { type: Number, default: 10 }
})

const recent = computed(() =>
  [...props.rows]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, props.days)
)

/** 股 → 張，資料不足回傳 null。 */
function lots(shares) {
  return sharesToLots(shares, 0)
}

/** 顯示用：null 一律顯示「—」，不顯示 0。 */
function show(value) {
  if (value === null || value === undefined) return '—'
  return value.toLocaleString('zh-TW')
}

function sign(value) {
  if (value === null || value === undefined) return ''
  if (value > 0) return 'buy'
  if (value < 0) return 'sell'
  return ''
}

/** 區間合計。全部都是資料不足時回傳 null，而不是 0。 */
function total(key) {
  const values = recent.value.map((r) => r[key]).filter((v) => typeof v === 'number')
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0)
}
</script>

<template>
  <section class="institutional">
    <header>
      <h3>三大法人近 {{ days }} 日</h3>
      <span class="unit">單位：張（1 張 = 1000 股）</span>
    </header>

    <DataNotice
      v-if="recent.length === 0"
      message="沒有三大法人資料"
      detail="資料庫裡查無這檔股票的法人買賣超紀錄"
    />

    <table v-else>
      <thead>
        <tr>
          <th>日期</th>
          <th>外資</th>
          <th>投信</th>
          <th>自營商</th>
          <th>合計</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in recent" :key="r.date">
          <td class="date">{{ r.date }}</td>
          <td :class="sign(r.foreign_net)">{{ show(lots(r.foreign_net)) }}</td>
          <td :class="sign(r.trust_net)">{{ show(lots(r.trust_net)) }}</td>
          <td :class="sign(r.dealer_net)">{{ show(lots(r.dealer_net)) }}</td>
          <td :class="sign(r.total_net)">{{ show(lots(r.total_net)) }}</td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <td class="date">{{ recent.length }} 日合計</td>
          <td :class="sign(total('foreign_net'))">{{ show(lots(total('foreign_net'))) }}</td>
          <td :class="sign(total('trust_net'))">{{ show(lots(total('trust_net'))) }}</td>
          <td :class="sign(total('dealer_net'))">{{ show(lots(total('dealer_net'))) }}</td>
          <td :class="sign(total('total_net'))">{{ show(lots(total('total_net'))) }}</td>
        </tr>
      </tfoot>
    </table>

    <p v-if="recent.length" class="footnote">
      外資淨額比照證交所「外資及陸資」口徑，含外資自營商。
      自營商含自行買賣與避險。正數為買超、負數為賣超。
    </p>
  </section>
</template>

<style scoped>
.institutional { margin-top: 1.5rem; }
header {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
}
h3 { margin: 0 0 0.4rem; font-size: 0.9rem; font-weight: 600; color: #3f3f46; }
.unit { color: #a1a1aa; font-size: 0.75rem; }
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
}
th, td {
  padding: 0.35rem 0.5rem;
  text-align: right;
  border-bottom: 1px solid #f4f4f5;
}
th { color: #71717a; font-weight: 500; }
th:first-child, td.date { text-align: left; color: #71717a; }
tfoot td { font-weight: 600; border-top: 2px solid #e4e4e7; border-bottom: none; }
.buy { color: #d64545; }
.sell { color: #2f9e64; }
.footnote { margin: 0.5rem 0 0; color: #a1a1aa; font-size: 0.75rem; line-height: 1.5; }
</style>
