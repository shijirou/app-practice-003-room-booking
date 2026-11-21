import { useEffect, type RefObject } from 'react'

/** 小窓が開いているとき、外側を押す・Esc キーを押すと閉じる。box は、小窓と開くボタンをまとめて囲む要素。 */
export function useDismiss(open: boolean, box: RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) close()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, box, close])
}
