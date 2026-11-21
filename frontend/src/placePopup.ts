/** 小窓を出す位置（ページの左上からの px）。 */
export type Pos = { left: number; top: number }

export const POPUP_WIDTH = 330

/**
 * 表の枠（rect）の近くに小窓を出す位置を決める。枠の下に出し、下にはみ出すなら上に出す。
 * height は小窓のおおよその高さ。
 */
export function placePopup(rect: DOMRect, height: number): Pos {
  const left = Math.min(Math.max(rect.left, 8), Math.max(8, window.innerWidth - POPUP_WIDTH - 8))
  let top = rect.bottom + 8
  if (top + height > window.innerHeight) {
    top = rect.top - height - 8 >= 0 ? rect.top - height - 8 : Math.max(8, window.innerHeight - height - 8)
  }
  return { left: left + window.scrollX, top: top + window.scrollY }
}
