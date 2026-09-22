/**
 * 追蹤池的內容雜湊。
 *
 * 用途：證交所的端點是「一次給全市場一天」，抓取腳本取回整天的資料後只留
 * 追蹤池裡的股票。中斷後的接續機制靠 data_fetch_log 判斷某一天抓過了而跳過，
 * 但追蹤池一旦變動，那個判斷就不成立——新加入的股票會因為日期被跳過而
 * 永遠沒有歷史資料，且不會有任何錯誤訊息。
 *
 * 因此每筆抓取紀錄都附上當時追蹤池的雜湊，接續時只跳過雜湊相同的日期。
 *
 * 放在 scripts/ 而不是 src/lib/：這裡用到 node:crypto，
 * 一旦被前端 import 就會打包失敗。前端用不到這個功能。
 */
import { createHash } from 'node:crypto'

/**
 * @param {string[]} stockIds 追蹤池裡的證券代號，順序不影響結果
 * @returns {string} sha256 前 12 碼
 */
export function watchlistHash(stockIds) {
  if (!Array.isArray(stockIds)) {
    throw new TypeError(`stockIds 必須是陣列，收到 ${typeof stockIds}`)
  }
  // 排序後去重，確保同樣的一組股票永遠得到同樣的雜湊
  const normalized = [...new Set(stockIds.map((s) => String(s).trim()).filter(Boolean))].sort()
  return createHash('sha256').update(normalized.join(',')).digest('hex').slice(0, 12)
}
