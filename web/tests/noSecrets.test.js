/**
 * 守門測試：repo 裡的任何檔案都不能出現真實的金鑰或 token。
 *
 * CLAUDE.md 規定「任何 key 或 token 都不能寫進程式碼，也不能被 commit」。
 * 這條規則曾經被違反過一次：寫測試時直接貼了真實的 Supabase 公開金鑰，
 * 而且當時的人工檢查規則沒涵蓋那種格式。所以改成由測試強制執行，
 * GitHub Actions 每次都會跑，不再依賴誰記得去檢查。
 *
 * 測試裡需要金鑰格式時，一律用含有 FAKE 字樣的假值，例如 sb_secret_FAKE_FOR_TESTS_ONLY。
 */
import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = execSync('git rev-parse --show-toplevel', { cwd: __dirname }).toString().trim()

// 只掃 git 追蹤中或即將被追蹤的檔案（排除 node_modules、dist 等被忽略的）
const files = execSync('git ls-files --cached --others --exclude-standard', { cwd: ROOT })
  .toString()
  .split('\n')
  .filter(Boolean)
  .filter((f) => !/\.(png|jpe?g|gif|ico|pdf|woff2?|lock)$/i.test(f))
  .filter((f) => f !== 'package-lock.json')

const PATTERNS = [
  { name: 'Supabase 新版金鑰', re: /sb_(?:publishable|secret)_[A-Za-z0-9_-]{16,}/g },
  // 真正的 JWT 由三段組成，前兩段都是 base64 的 JSON（以 eyJ 開頭）
  { name: 'JWT（例如舊版 Supabase 金鑰）', re: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{30,}/g },
  { name: 'FinMind token 賦值', re: /FINMIND_TOKEN\s*=\s*['"]?[A-Za-z0-9._-]{20,}/g }
]

function findings() {
  const hits = []
  for (const file of files) {
    let text
    try {
      text = readFileSync(resolve(ROOT, file), 'utf8')
    } catch {
      continue // 刪除中或讀不到的檔案略過
    }
    for (const { name, re } of PATTERNS) {
      for (const m of text.matchAll(re)) {
        if (m[0].includes('FAKE')) continue // 明確標示的假值
        const line = text.slice(0, m.index).split('\n').length
        hits.push(`${file}:${line}  ${name}  ${m[0].slice(0, 20)}…`)
      }
    }
  }
  return hits
}

describe('repo 內不能有真實的金鑰或 token', () => {
  it('掃描所有檔案', () => {
    expect(files.length).toBeGreaterThan(10) // 確認真的有掃到檔案，不是空跑
    const hits = findings()
    if (hits.length) {
      throw new Error(
        `發現疑似真實金鑰，請移除後改放 .env（測試用假值請加上 FAKE 字樣）：\n  ${hits.join('\n  ')}`
      )
    }
  })

  it('偵測規則本身有效（用執行期組出來的假金鑰驗證，不寫成字面值）', () => {
    const fakeLooksReal = 'sb_' + 'secret_' + 'A1b2C3d4E5f6G7h8I9j0'
    expect(PATTERNS[0].re.test(fakeLooksReal)).toBe(true)
    PATTERNS[0].re.lastIndex = 0
  })
})
