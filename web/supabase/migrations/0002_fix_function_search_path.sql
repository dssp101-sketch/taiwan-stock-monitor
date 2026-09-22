-- 0002_fix_function_search_path.sql
--
-- Supabase 的安全檢查（database linter）指出：
--   Function `public.set_updated_at` has a role mutable search_path
--
-- 沒有固定 search_path 的函式，理論上可以被「在搜尋路徑較前面的 schema 裡
-- 建立同名物件」的方式劫持，讓函式執行到非預期的程式碼。
-- 這是 SECURITY DEFINER 函式的經典攻擊手法；本函式雖然不是 SECURITY DEFINER，
-- 風險較低，但固定 search_path 沒有任何代價，該修就修。
--
-- 設成空字串代表完全不使用搜尋路徑，函式內所有物件都必須寫完整名稱。
-- 本函式只用到 now() 這個內建函式，改用 pg_catalog.now() 明確指定。
create or replace function set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;
