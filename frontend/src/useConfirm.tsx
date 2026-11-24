import { useCallback, useRef, useState } from 'react'
import { ConfirmDialog, type ConfirmRequest } from './ConfirmDialog'

/**
 * 確認を「答えを待つ関数」として使うための部品。
 * `const { ask, dialog } = useConfirm()` とし、`dialog` を画面のどこかに置く。`if (!(await ask({...}))) return` のように使える。
 */
export function useConfirm() {
  const [pending, setPending] = useState<{ request: ConfirmRequest; resolve: (ok: boolean) => void } | null>(null)
  // 答えを待っている最中の resolve（あとから来た確認が、前の確認を「戻る」で終わらせるため）
  const current = useRef<((ok: boolean) => void) | null>(null)

  const ask = useCallback((request: ConfirmRequest) => {
    current.current?.(false)
    return new Promise<boolean>((resolve) => {
      current.current = resolve
      setPending({ request, resolve })
    })
  }, [])

  const answer = (ok: boolean) => {
    pending?.resolve(ok)
    current.current = null
    setPending(null)
  }

  const dialog = pending ? <ConfirmDialog request={pending.request} onAnswer={answer} /> : null
  return { ask, dialog }
}
