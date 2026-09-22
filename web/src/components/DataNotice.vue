<script setup>
/**
 * 資料不足／載入中的統一提示。
 * 畫面上絕不用模擬資料填補，一律顯示這個。
 */
defineProps({
  state: { type: String, default: 'empty' }, // empty | loading | error
  message: { type: String, default: '' },
  detail: { type: String, default: '' }
})
</script>

<template>
  <div class="notice" :class="state">
    <p class="main">
      <span v-if="state === 'loading'">載入中…</span>
      <span v-else-if="state === 'error'">讀取失敗</span>
      <span v-else>資料不足</span>
      <template v-if="message">：{{ message }}</template>
    </p>
    <p v-if="detail" class="detail">{{ detail }}</p>
  </div>
</template>

<style scoped>
.notice {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  min-height: 120px;
  padding: 1.5rem 1rem;
  border: 1px dashed #d4d4d8;
  border-radius: 8px;
  background: #fafafa;
  text-align: center;
}
.notice.error { border-color: #fca5a5; background: #fef2f2; }
.main { margin: 0; color: #52525b; font-size: 0.95rem; }
.notice.error .main { color: #b91c1c; }
.detail { margin: 0; color: #a1a1aa; font-size: 0.8rem; }
</style>
