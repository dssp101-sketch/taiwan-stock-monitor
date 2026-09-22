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

## 環境變數

| 變數 | 放哪裡 | 用途 |
|---|---|---|
| `VITE_SUPABASE_URL` | 前端（會進 bundle） | Supabase 專案網址，結尾不要加斜線 |
| `VITE_SUPABASE_ANON_KEY` | 前端（會進 bundle） | anon key，靠 RLS 保護 |
| `SUPABASE_URL` | Vercel / GitHub Actions | 同上，伺服器端用 |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel / GitHub Actions | **祕密**，絕不能進前端 |
| `FINMIND_TOKEN` | GitHub Actions | **祕密**，絕不能進前端 |

在 Vercel 設定環境變數時記得勾選 Production。
