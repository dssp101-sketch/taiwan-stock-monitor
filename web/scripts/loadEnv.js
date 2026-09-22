/**
 * 讀取 web/.env 並放進 process.env。
 *
 * 為什麼要自己寫：Node.js 不像 Vite 會自動讀 .env。Node 20.6 以後雖然有
 * `--env-file` 參數、21.7 以後有 process.loadEnvFile()，但版本要求不一致，
 * 而且使用者未必記得加參數。這裡用最小的實作，Node 18 以上都能跑，
 * 也不用多裝套件。
 *
 * 規則：
 * - **已存在的環境變數優先**。GitHub Actions 的 secrets 會直接設成環境變數，
 *   不能被 repo 裡的 .env 蓋掉。
 * - 支援 # 開頭的註解、值兩側的引號、Windows 換行、記事本存檔的 BOM。
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const WEB_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * @param {string} [envPath] 自訂 .env 路徑，預設是 web/.env。測試用。
 * @returns {{path:string, exists:boolean, applied:string[], hint:string|null}}
 *          applied 是這次真的被設定的變數名稱（不含值）
 */
export function loadEnv(envPath) {
  const path = envPath ?? resolve(WEB_DIR, '.env')

  if (!existsSync(path)) {
    // Windows 的記事本很容易存成 .env.txt，這是最常見的失敗原因
    const txt = `${path}.txt`
    return {
      path,
      exists: false,
      applied: [],
      hint: existsSync(txt)
        ? '找到 .env.txt，記事本把副檔名加上去了。請把檔名改成 .env（不要有 .txt）。'
        : null
    }
  }

  const text = readFileSync(path, 'utf8').replace(/^﻿/, '')
  const applied = []

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const eq = line.indexOf('=')
    if (eq === -1) continue

    const key = line.slice(0, eq).trim()
    if (!key) continue

    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    // 已經設定的不覆蓋，讓 CI 的 secrets 永遠優先
    if (process.env[key] === undefined) {
      process.env[key] = value
      applied.push(key)
    }
  }

  return { path, exists: true, applied, hint: null }
}

/** 在 --check 模式印出診斷，方便使用者自己找出哪裡沒設好。 */
export function reportEnv(result) {
  if (!result.exists) {
    console.log(`📄 找不到 .env：${result.path}`)
    if (result.hint) console.log(`   ⚠️ ${result.hint}`)
    return
  }
  console.log(`📄 已讀取 .env：${result.path}`)
  console.log(`   設定了 ${result.applied.length} 個變數：${result.applied.join('、') || '（沒有新的，可能已由系統環境變數提供）'}`)

  for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
    const v = process.env[key]
    if (!v) {
      console.log(`   ❌ ${key} 沒有值`)
    } else if (key.endsWith('URL')) {
      const trailing = v.endsWith('/') ? '（⚠️ 結尾有斜線，請刪掉）' : ''
      console.log(`   ✅ ${key} = ${v}${trailing}`)
    } else {
      // 祕密只顯示開頭與長度，不印出內容
      console.log(`   ✅ ${key} = ${v.slice(0, 11)}…（共 ${v.length} 字）`)
    }
  }
}
