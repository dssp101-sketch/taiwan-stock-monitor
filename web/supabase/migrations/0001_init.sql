-- 0001_init.sql
-- 台股個人分析平台：初始 schema
--
-- 單位原則：所有股數一律存「股」，只在前端顯示時 ÷1000 換算成「張」。
-- 金額一律存「元」。價格保留 4 位小數（台股最小跳動單位為 0.01，留餘裕給還原股價）。
-- 安全原則：所有資料表啟用 RLS。只有登入者（authenticated）能讀，
--           寫入一律由伺服器端的 service role key 執行（service role 會繞過 RLS）。
--           未登入的 anon 角色沒有任何 policy，因此讀不到任何一列。

-- ---------------------------------------------------------------
-- 共用：updated_at 自動更新
-- ---------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------
-- stocks：股票基本資料
--
-- market 直接存 FinMind TaiwanStockInfo 的 type 原始值（twse = 上市、
-- tpex = 上櫃，另有興櫃等）。不在資料庫層做中文轉換，也不加 check 約束：
-- 一旦 FinMind 新增沒看過的市場別，加約束會讓整批寫入失敗而遺失資料。
-- 中文顯示由前端的對照表負責，對照不到時直接顯示原始值。
-- ---------------------------------------------------------------
create table stocks (
  stock_id    text primary key,
  name        text not null,
  industry    text,
  market      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table stocks is '股票基本資料。stock_id 為證券代號，例如 2330。';
comment on column stocks.market is 'FinMind TaiwanStockInfo 的 type 原始值：twse（上市）、tpex（上櫃）等。';
comment on column stocks.industry is 'FinMind 的 industry_category 原始值。';

create trigger stocks_set_updated_at
  before update on stocks
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------
-- daily_prices：日 K
--
-- 對應 FinMind TaiwanStockPrice。注意該 dataset 的最高、最低價欄位
-- 叫 max / min，不是 high / low。
-- ---------------------------------------------------------------
create table daily_prices (
  stock_id  text not null references stocks(stock_id) on delete cascade,
  date      date not null,
  open      numeric(12, 4),
  high      numeric(12, 4),
  low       numeric(12, 4),
  close     numeric(12, 4),
  volume    bigint check (volume >= 0),
  turnover  bigint check (turnover >= 0),
  primary key (stock_id, date)
);

comment on table daily_prices is '日 K 線。無成交日的開高低收可能為 0，資料照實存，計算指標前再由程式過濾（見 CLAUDE.md「已知的坑」）。';
comment on column daily_prices.high is 'FinMind TaiwanStockPrice 的 max 欄位。';
comment on column daily_prices.low is 'FinMind TaiwanStockPrice 的 min 欄位。';
comment on column daily_prices.volume is '成交量，來自 Trading_Volume，單位為「股」。顯示成「張」時需 ÷1000。';
comment on column daily_prices.turnover is '成交金額，來自 Trading_money，單位為「元」。';

create index daily_prices_date_idx on daily_prices (date);

-- ---------------------------------------------------------------
-- institutional_flows：三大法人買賣超
--
-- FinMind TaiwanStockInstitutionalInvestorsBuySell 是「長表」：
-- 同一檔同一天會有多列，靠 name 欄位區分法人類別。這張表把它攤平成寬表，
-- 六種類別全部分開存，不預先加總，這樣評分卡才能展開看到每一項原始數值。
--
-- name 的六種值與對應欄位：
--   Foreign_Investor     外資             → foreign_investor_*
--   Foreign_Dealer_Self  外資自營商       → foreign_dealer_self_*
--   Investment_Trust     投信             → investment_trust_*
--   Dealer_self          自營商（自行買賣）→ dealer_self_*
--   Dealer_Hedging       自營商（避險）    → dealer_hedging_*
--   Dealer               自營商（合併，舊制）→ dealer_*
-- ---------------------------------------------------------------
create table institutional_flows (
  stock_id                 text not null references stocks(stock_id) on delete cascade,
  date                     date not null,

  foreign_investor_buy     bigint check (foreign_investor_buy     >= 0),
  foreign_investor_sell    bigint check (foreign_investor_sell    >= 0),
  foreign_dealer_self_buy  bigint check (foreign_dealer_self_buy  >= 0),
  foreign_dealer_self_sell bigint check (foreign_dealer_self_sell >= 0),
  investment_trust_buy     bigint check (investment_trust_buy     >= 0),
  investment_trust_sell    bigint check (investment_trust_sell    >= 0),
  dealer_self_buy          bigint check (dealer_self_buy          >= 0),
  dealer_self_sell         bigint check (dealer_self_sell         >= 0),
  dealer_hedging_buy       bigint check (dealer_hedging_buy       >= 0),
  dealer_hedging_sell      bigint check (dealer_hedging_sell      >= 0),
  dealer_buy               bigint check (dealer_buy               >= 0),
  dealer_sell              bigint check (dealer_sell              >= 0),

  -- 淨額一律由資料庫計算，不從來源寫入，避免來源與計算不一致。
  -- 外資淨額比照證交所「外資及陸資」口徑，含外資自營商。
  foreign_net bigint generated always as (
    coalesce(foreign_investor_buy, 0) + coalesce(foreign_dealer_self_buy, 0)
    - coalesce(foreign_investor_sell, 0) - coalesce(foreign_dealer_self_sell, 0)
  ) stored,

  trust_net bigint generated always as (
    coalesce(investment_trust_buy, 0) - coalesce(investment_trust_sell, 0)
  ) stored,

  -- 自營商含自行買賣、避險，以及舊制的合併欄位（新制資料該欄通常為 null）。
  dealer_net bigint generated always as (
    coalesce(dealer_self_buy, 0) + coalesce(dealer_hedging_buy, 0) + coalesce(dealer_buy, 0)
    - coalesce(dealer_self_sell, 0) - coalesce(dealer_hedging_sell, 0) - coalesce(dealer_sell, 0)
  ) stored,

  -- PostgreSQL 的計算欄位不能引用其他計算欄位，所以這裡整串重寫一次。
  total_net bigint generated always as (
    coalesce(foreign_investor_buy, 0) + coalesce(foreign_dealer_self_buy, 0)
    + coalesce(investment_trust_buy, 0)
    + coalesce(dealer_self_buy, 0) + coalesce(dealer_hedging_buy, 0) + coalesce(dealer_buy, 0)
    - coalesce(foreign_investor_sell, 0) - coalesce(foreign_dealer_self_sell, 0)
    - coalesce(investment_trust_sell, 0)
    - coalesce(dealer_self_sell, 0) - coalesce(dealer_hedging_sell, 0) - coalesce(dealer_sell, 0)
  ) stored,

  primary key (stock_id, date)
);

comment on table institutional_flows is
  '三大法人買賣超，六種類別分開存。所有欄位單位皆為「股」，顯示成「張」時需 ÷1000。';
comment on column institutional_flows.foreign_net is
  '外資淨額（含外資自營商），比照證交所「外資及陸資」口徑。';
comment on column institutional_flows.dealer_net is
  '自營商淨額，含自行買賣、避險與舊制合併欄位。';

create index institutional_flows_date_idx on institutional_flows (date);

-- ---------------------------------------------------------------
-- margin：融資融券
-- ---------------------------------------------------------------
create table margin (
  stock_id        text not null references stocks(stock_id) on delete cascade,
  date            date not null,
  margin_balance  bigint check (margin_balance >= 0),
  short_balance   bigint check (short_balance  >= 0),
  primary key (stock_id, date)
);

comment on table margin is
  '融資融券今日餘額，來自 FinMind TaiwanStockMarginPurchaseShortSale 的 '
  'MarginPurchaseTodayBalance 與 ShortSaleTodayBalance。'
  '單位：FinMind 官方文件未標示，抓到真實資料後必須跟證交所公告核對後再確定，'
  '在核對完成前不要拿這兩個欄位做任何跨股票的比較或評分。';

create index margin_date_idx on margin (date);

-- ---------------------------------------------------------------
-- watchlist：追蹤股票池
-- ---------------------------------------------------------------
create table watchlist (
  stock_id    text primary key references stocks(stock_id) on delete cascade,
  tags        text[] not null default '{}',
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table watchlist is '追蹤股票池。抓資料腳本只抓這張表裡的股票，先控制在 50 檔以內。';

create trigger watchlist_set_updated_at
  before update on watchlist
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------
-- data_fetch_log：抓取紀錄
-- ---------------------------------------------------------------
create table data_fetch_log (
  id           bigint generated always as identity primary key,
  dataset      text not null,
  stock_id     text,
  target_date  date,
  status       text not null check (status in ('success', 'failed', 'skipped')),
  row_count    integer not null default 0 check (row_count >= 0),
  message      text,
  fetched_at   timestamptz not null default now()
);

comment on table data_fetch_log is '每次抓取的紀錄，用來找出缺漏的資料。dataset 存 FinMind 的 dataset 名稱。';

create index data_fetch_log_lookup_idx on data_fetch_log (dataset, target_date);

-- ---------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------
alter table stocks               enable row level security;
alter table daily_prices         enable row level security;
alter table institutional_flows  enable row level security;
alter table margin               enable row level security;
alter table watchlist            enable row level security;
alter table data_fetch_log       enable row level security;

-- 唯讀資料：登入者可讀，寫入只能靠 service role（繞過 RLS）。
create policy stocks_read              on stocks              for select to authenticated using (true);
create policy daily_prices_read        on daily_prices        for select to authenticated using (true);
create policy institutional_flows_read on institutional_flows for select to authenticated using (true);
create policy margin_read              on margin              for select to authenticated using (true);
create policy data_fetch_log_read      on data_fetch_log      for select to authenticated using (true);

-- 追蹤清單：登入者可以自行增刪改。
create policy watchlist_read   on watchlist for select to authenticated using (true);
create policy watchlist_insert on watchlist for insert to authenticated with check (true);
create policy watchlist_update on watchlist for update to authenticated using (true) with check (true);
create policy watchlist_delete on watchlist for delete to authenticated using (true);

-- ---------------------------------------------------------------
-- 資料表權限
--
-- Supabase 預設會把 public schema 的新資料表 grant ALL 給 anon 與 authenticated，
-- 安全性完全只靠 RLS 一層。這裡明確收回並只給必要權限，變成兩層防護：
-- 就算哪天 policy 寫錯，anon 連 table 層級的權限都沒有。
-- service_role 具備 BYPASSRLS，負責由伺服器端寫入。
-- ---------------------------------------------------------------
revoke all on stocks, daily_prices, institutional_flows, margin, watchlist, data_fetch_log
  from anon, authenticated;

grant select on stocks, daily_prices, institutional_flows, margin, data_fetch_log
  to authenticated;

grant select, insert, update, delete on watchlist to authenticated;

grant all on stocks, daily_prices, institutional_flows, margin, watchlist, data_fetch_log
  to service_role;
