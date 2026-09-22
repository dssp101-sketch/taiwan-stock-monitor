-- 0003_fetch_log_watchlist_hash.sql
--
-- 證交所的端點是「一次給全市場一天」，抓取腳本取回整天的資料後，
-- 只保留追蹤池裡的股票。中斷後的接續機制靠 data_fetch_log 判斷
-- 「這個資料集的這一天抓過了」而跳過。
--
-- 問題：追蹤池變動之後，那個判斷就不成立了。
-- 先用 3 檔回補完，之後再加 2 檔重跑，所有日期都會被當成已完成而跳過，
-- 新加的兩檔永遠不會有歷史資料，而且不會有任何錯誤訊息。
--
-- 解法：把當次抓取時的追蹤池內容做成雜湊一併記錄。
-- 接續時只跳過「追蹤池雜湊相同」的日期；追蹤池一變動，雜湊就不同，
-- 該重抓的會重抓。
alter table data_fetch_log add column watchlist_hash text;

comment on column data_fetch_log.watchlist_hash is
  '該次抓取時追蹤池內容的雜湊（stock_id 排序後取 sha256 前 12 碼）。'
  '追蹤池變動後雜湊會改變，接續機制因此會重新抓取，避免新增的股票缺歷史資料。';

-- 接續時會用 dataset + watchlist_hash + status 查詢
create index data_fetch_log_resume_idx
  on data_fetch_log (dataset, watchlist_hash, status, target_date);
