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
