import { createClient } from '@supabase/supabase-js'

// 只使用 anon key。anon key 設計上就是公開的，真正的保護來自資料表的 RLS。
// service role key 永遠不會出現在前端，只存在於 Vercel 伺服器端與 GitHub Actions 的環境變數。
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isConfigured = Boolean(url && anonKey)

export const supabase = isConfigured ? createClient(url, anonKey) : null
