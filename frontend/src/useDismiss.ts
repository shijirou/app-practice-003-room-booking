import { useEffect, type RefObject } from 'react'

/**
 * 小窓が開いているとき、外側を押す・Esc キーを押すと閉じる。box は、小窓と開くボタンをまとめて囲む要素。
 * swallow が true なら、外側を押した操作は下の表やボタンには通さない。
 * onOutside を渡すと、外側を押したときは close の代わりにそれを呼ぶ（Esc は close のまま）。
 */
export function useDismiss(
  open: boolean,
  box: RefObject<HTMLElement | null>,
  close: () => void,
  swallow = false,
  onOutside: () => void = close,
) {
  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      if (!box.current || box.current.contains(e.target as Node)) return
      if (swallow) {
        // 押した操作（mousedown とそのあとの click）を、下の要素に届けない
        e.stopPropagation()
        e.preventDefault()
        const eat = (ev: Event) => {
          ev.stopPropagation()
          ev.preventDefault()
        }
        document.addEventListener('click', eat, { capture: true, once: true })
        setTimeout(() => document.removeEventListener('click', eat, true), 400)
      }
      onOutside()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    // swallow のときは、下の要素より先に受けるため、捕まえる側（capture）で聞く
    document.addEventListener('mousedown', onMouseDown, swallow)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown, swallow)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, box, close, swallow, onOutside])
}
