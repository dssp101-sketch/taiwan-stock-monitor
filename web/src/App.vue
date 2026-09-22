<script setup>
import { isConfigured } from './lib/supabase.js'
</script>

<template>
  <main class="wrap">
    <h1>台股個人分析平台</h1>
    <p class="sub">階段一骨架。目前尚未接上任何資料來源。</p>

    <section class="card">
      <h2>環境狀態</h2>
      <p v-if="isConfigured">Supabase 連線參數已設定。</p>
      <p v-else class="warn">
        資料不足：尚未設定 <code>VITE_SUPABASE_URL</code> 與
        <code>VITE_SUPABASE_ANON_KEY</code>，無法連線資料庫。
      </p>
    </section>

    <footer>
      <p class="note">
        本頁不顯示任何模擬或亂數資料。資料不足時一律標示「資料不足」。
      </p>
    </footer>
  </main>
</template>

<style scoped>
.wrap {
  max-width: 720px;
  margin: 0 auto;
  padding: 2rem 1rem;
  font-family: system-ui, "Noto Sans TC", sans-serif;
  line-height: 1.6;
}
h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
.sub { color: #666; margin-top: 0; }
.card {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 1rem;
  margin-top: 1.5rem;
}
.card h2 { font-size: 1rem; margin-top: 0; }
.warn { color: #b45309; }
code { background: #f4f4f5; padding: 0.1rem 0.3rem; border-radius: 3px; }
.note { color: #888; font-size: 0.85rem; margin-top: 2rem; }
</style>
