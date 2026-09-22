import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadEnv } from '../scripts/loadEnv.js'

let dir
const KEYS = ['T_URL', 'T_SECRET', 'T_QUOTED', 'T_EMPTY', 'T_EQ', 'SUPABASE_URL']

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'envtest-'))
  for (const k of KEYS) delete process.env[k]
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  for (const k of KEYS) delete process.env[k]
})

function write(name, content) {
  const p = join(dir, name)
  writeFileSync(p, content)
  return p
}

describe('loadEnv', () => {
  it('讀取基本的 key=value', () => {
    const p = write('.env', 'T_URL=https://example.supabase.co\nT_SECRET=abc123\n')
    const r = loadEnv(p)
    expect(r.exists).toBe(true)
    expect(process.env.T_URL).toBe('https://example.supabase.co')
    expect(process.env.T_SECRET).toBe('abc123')
    expect(r.applied).toEqual(['T_URL', 'T_SECRET'])
  })

  it('忽略註解與空行', () => {
    const p = write('.env', '# 這是註解\n\nT_URL=x\n   # 縮排的註解\n')
    loadEnv(p)
    expect(process.env.T_URL).toBe('x')
  })

  it('去掉值兩側的引號', () => {
    const p = write('.env', 'T_QUOTED="有引號"\n')
    loadEnv(p)
    expect(process.env.T_QUOTED).toBe('有引號')
  })

  it('處理 Windows 換行與記事本的 BOM', () => {
    const p = write('.env', '﻿T_URL=windows\r\nT_SECRET=crlf\r\n')
    loadEnv(p)
    expect(process.env.T_URL).toBe('windows')
    expect(process.env.T_SECRET).toBe('crlf')
  })

  it('值裡面有等號時只切第一個', () => {
    const p = write('.env', 'T_EQ=a=b=c\n')
    loadEnv(p)
    expect(process.env.T_EQ).toBe('a=b=c')
  })

  it('已存在的環境變數優先，不被 .env 蓋掉（CI 的 secrets 必須贏）', () => {
    process.env.SUPABASE_URL = '來自 CI 的值'
    const p = write('.env', 'SUPABASE_URL=來自檔案的值\n')
    const r = loadEnv(p)
    expect(process.env.SUPABASE_URL).toBe('來自 CI 的值')
    expect(r.applied).not.toContain('SUPABASE_URL')
  })

  it('找不到檔案時回報完整路徑，不丟錯', () => {
    const p = join(dir, '.env')
    const r = loadEnv(p)
    expect(r.exists).toBe(false)
    expect(r.path).toBe(p)
    expect(r.hint).toBeNull()
  })

  it('偵測到 .env.txt 時特別提示（Windows 記事本的常見陷阱）', () => {
    write('.env.txt', 'T_URL=x\n')
    const r = loadEnv(join(dir, '.env'))
    expect(r.exists).toBe(false)
    expect(r.hint).toContain('.env.txt')
  })

  it('空值不會變成 undefined', () => {
    const p = write('.env', 'T_EMPTY=\n')
    loadEnv(p)
    expect(process.env.T_EMPTY).toBe('')
  })
})
