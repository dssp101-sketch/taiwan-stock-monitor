<script setup>
import { ref } from 'vue'
import { isConfigured } from './lib/supabase.js'
import StockPage from './pages/StockPage.vue'

const stockId = ref('2330')
const input = ref('2330')

function submit() {
  const v = input.value.trim()
  if (v) stockId.value = v
}
</script>

<template>
  <main class="wrap">
    <header class="top">
      <h1>台股個人分析平台</h1>
      <form class="search" @submit.prevent="submit">
        <input v-model="input" placeholder="股票代號，例如 2330" aria-label="股票代號" />
        <button type="submit">查詢</button>
      </form>
    </header>

    <p v-if="!isConfigured" class="warn">
      尚未設定 <code>VITE_SUPABASE_URL</code> 與 <code>VITE_SUPABASE_ANON_KEY</code>，
      目前無法讀取任何資料。畫面不會用模擬資料填補。
    </p>

    <StockPage :stock-id="stockId" />
  </main>
</template>

<style>
body {
  margin: 0;
  background: #ffffff;
  font-family: system-ui, "Noto Sans TC", "PingFang TC", sans-serif;
  color: #18181b;
}
</style>

<style scoped>
.wrap { max-width: 960px; margin: 0 auto; padding: 1.5rem 1rem 3rem; line-height: 1.6; }
.top { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.25rem; }
h1 { margin: 0; font-size: 1.35rem; }
.search { display: flex; gap: 0.4rem; margin-left: auto; }
input {
  padding: 0.35rem 0.6rem;
  border: 1px solid #d4d4d8;
  border-radius: 6px;
  font-size: 0.9rem;
}
button {
  padding: 0.35rem 0.9rem;
  border: 1px solid #18181b;
  border-radius: 6px;
  background: #18181b;
  color: #fff;
  font-size: 0.9rem;
  cursor: pointer;
}
.warn {
  padding: 0.5rem 0.75rem;
  border-left: 3px solid #f59e0b;
  background: #fffbeb;
  color: #92400e;
  font-size: 0.85rem;
}
code { background: #f4f4f5; padding: 0.1rem 0.3rem; border-radius: 3px; }
</style>
