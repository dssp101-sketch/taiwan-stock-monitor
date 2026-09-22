# 台股個人分析平台（web）

自用工具。規格與開發原則見 repo 根目錄的 `CLAUDE.md`。

## 為什麼在 `web/` 子目錄

這個 repo 根目錄原本放的是另一個專案（Python 的全球六國股市監控，`main.py` / `downloader_*.py` /
`.github/workflows/daily_report.yml`）。兩個專案並存，所以台股平台全部收在 `web/` 底下，
互不干擾。

**Vercel 設定：Root Directory 要填 `web`**，否則會在根目錄找不到 `package.json`。

## 目錄結構

```
web/
├── api/                      # Vercel Serverless Functions（Node.js）
├── scripts/                  # GitHub Actions 用的抓資料腳本
├── src/
│   ├── indicators/           # 技術指標純函式（每個都要有單元測試）
│   ├── lib/                  # supabase client、單位換算等共用工具
│   ├── components/
│   └── pages/
├── supabase/migrations/      # 遞增編號的 SQL migration
└── tests/                    # Vitest 測試
```

## 本機開發

```bash
cd web
npm install
cp .env.example .env    # 填入真實值
npm run dev             # 開發伺服器
npm test                # 單元測試
npm run build           # 產生 dist/
```

## 技術指標

`src/indicators/` 底下每個指標都是純函式，不碰資料庫、不碰網路、不改動傳入的陣列。

| 模組 | 內容 | 說明 |
|---|---|---|
| `sma.js` | 簡單移動平均 | 每格重算視窗，避免滾動加總的浮點漂移 |
| `ema.js` | 指數移動平均 | 以前 n 筆簡單平均當種子 |
| `macd.js` | DIF／MACD／OSC | 預設 12/26/9，訊號線只在 DIF 有值的區段上計算 |
| `rsi.js` | RSI | Wilder 原始平滑法 |
| `kd.js` | K／D／RSV | 台灣慣用 9 日與 1/3 平滑，前值以 50 起算 |
| `bollinger.js` | 布林通道 | 母體標準差（分母 n），另附 bandwidth |
| `obv.js` | 能量潮 | 成交量單位為股 |
| `atr.js` | ATR／TR | Wilder 原始平滑法 |

共通約定：

1. 輸出長度一律等於輸入長度。
2. 資料不足的位置是 `null`，**絕不用 0 或前值填補**。
3. 遞迴型指標（EMA、RSI、KD、ATR）遇到髒資料會重新尋找種子，不讓髒值汙染後面全部。
4. 呼叫前先用 `lib/priceSeries.js` 的 `cleanDailyPrices()` 濾掉無成交日（收盤價 0），
   該函式會回報排除了幾筆，畫面上要誠實顯示，不要默默吃掉。

## 資料庫

`supabase/migrations/0001_init.sql` 建立 6 張表：
`stocks`、`daily_prices`、`institutional_flows`、`margin`、`watchlist`、`data_fetch_log`。

- 所有股數欄位單位一律是**股**，只在前端顯示時 ÷1000 換算成**張**。
- 六張表全部啟用 RLS。登入者（authenticated）只能讀；寫入一律靠伺服器端的
  service role key（會繞過 RLS）。`watchlist` 例外，登入者可以自行增刪改。
- 未登入的 anon 角色沒有任何 policy，讀不到任何一列。

## 抓資料腳本

`scripts/fetchFinMind.js`，由 GitHub Actions 每個交易日收盤後執行，也可以在本機手動跑。

```bash
cd web
node scripts/fetchFinMind.js --check                 # 只檢查設定與連線，不寫入
node scripts/fetchFinMind.js --add=2330,2317,2454    # 加入追蹤池
node scripts/fetchFinMind.js --mode=backfill --years=3   # 首次回補
node scripts/fetchFinMind.js --mode=daily --days=7       # 每日更新
```

保護機制：每次請求前節流，並讀回 FinMind 實際用量，接近上限就主動停止而不是硬撞。
每一次抓取成功或失敗都寫進 `data_fetch_log`，之後查得出哪一天缺資料。

### FinMind 欄位對照（取自官方套件原始碼，不是憑記憶）

來源：`FinMind/data/data_loader.py` 的 docstring。

| Dataset | 來源欄位 | 資料庫欄位 |
|---|---|---|
| `TaiwanStockInfo` | `stock_id`、`stock_name`、`industry_category`、`type` | `stocks.*` |
| `TaiwanStockPrice` | `open`、**`max`**、**`min`**、`close`、`Trading_Volume`、`Trading_money` | `daily_prices.*` |
| `TaiwanStockInstitutionalInvestorsBuySell` | `date`、`stock_id`、`name`、`buy`、`sell`（長表） | `institutional_flows.*`（攤平成寬表） |
| `TaiwanStockMarginPurchaseShortSale` | `MarginPurchaseTodayBalance`、`ShortSaleTodayBalance` | `margin.*` |

幾個容易寫錯的地方：

- 最高、最低價欄位是 **`max` / `min`**，不是 `high` / `low`。
- 市場別 `type` 是 **`twse` / `tpex`**，不是中文。資料庫存原始值，中文由前端對照。
- 三大法人是**長表**，同一檔同一天有多列，靠 `name` 區分類別，共六種：
  `Foreign_Investor`、`Foreign_Dealer_Self`、`Investment_Trust`、
  `Dealer_self`、`Dealer_Hedging`、`Dealer`（舊制合併）。六種全部分開存，
  淨額由資料庫的計算欄位加總，評分卡才能展開看到每一項原始數值。

### 尚未確認的事

- **融資融券的單位**：FinMind 官方文件沒有標示 `MarginPurchaseTodayBalance`
  是「股」還是「張」。抓到真實資料後必須跟證交所公告核對，核對完成前
  不要拿 `margin` 的欄位做任何評分或跨股票比較。

## 環境變數

| 變數 | 放哪裡 | 用途 |
|---|---|---|
| `VITE_SUPABASE_URL` | 前端（會進 bundle） | Supabase 專案網址，結尾不要加斜線 |
| `VITE_SUPABASE_ANON_KEY` | 前端（會進 bundle） | anon key，靠 RLS 保護 |
| `SUPABASE_URL` | Vercel / GitHub Actions | 同上，伺服器端用 |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel / GitHub Actions | **祕密**，絕不能進前端 |
| `FINMIND_TOKEN` | GitHub Actions | **祕密**，絕不能進前端 |

GitHub Actions 的三個 secret 設在 Settings → Secrets and variables → Actions：
`FINMIND_TOKEN`、`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`。

在 Vercel 設定環境變數時記得勾選 Production。
