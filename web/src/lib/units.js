/**
 * 單位換算。資料庫一律存「股」，只有顯示時才換成「張」。
 * 台股 1 張 = 1000 股。
 */
export const SHARES_PER_LOT = 1000

/**
 * 股 → 張。
 * 資料不足（null / undefined / NaN）時回傳 null，呼叫端負責顯示「資料不足」，
 * 絕不用 0 或任何預設值填補。
 *
 * @param {number|null|undefined} shares 股數
 * @param {number} [digits=2] 小數位數
 * @returns {number|null} 張數，資料不足時為 null
 */
export function sharesToLots(shares, digits = 2) {
  if (typeof shares !== 'number' || !Number.isFinite(shares)) return null
  const factor = 10 ** digits
  return Math.round((shares / SHARES_PER_LOT) * factor) / factor
}
