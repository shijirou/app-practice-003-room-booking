import { useEffect, type RefObject } from 'react'

/**
 * 小窓が開いているとき、外側を押す・Esc キーを押すと閉じる。box は、小窓と開くボタンをまとめて囲む要素。
 * swallow が true なら、外側を押した操作は下の表やボタンには通さない。
 * ignore（CSS セレクタ）を渡すと、その中を押したときは閉じず、押した操作もそのまま通す。
 */
export function useDismiss(
  open: boolean,
  box: RefObject<HTMLElement | null>,
  close: () => void,
  swallow = false,
  ignore?: string,
) {
  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      if (!box.current || box.current.contains(e.target as Node)) return
      if (ignore && e.target instanceof Element && e.target.closest(ignore)) return
      if (swallow) {
        // 押した操作（mousedown とそのあとの click）を、下の要素に届けない
        e.stopPropagation()
        e.preventDefault()
        const stop = () => {
          clearTimeout(timer)
          document.removeEventListener('click', eat, true)
          document.removeEventListener('mousedown', stop, true)
        }
        const eat = (ev: Event) => {
          ev.stopPropagation()
          ev.preventDefault()
          stop()
        }
        // click が来ないまま次の操作（新しい mousedown）が始まったり、400ms たったら、飲み込み役をやめる
        const timer = setTimeout(stop, 400)
        document.addEventListener('click', eat, true)
        document.addEventListener('mousedown', stop, true)
      }
      close()
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
  }, [open, box, close, swallow, ignore])
}
