import { useEffect, useState } from 'react'
import { ApiError } from './api'

/** 読み込みの状態。 */
export type Loaded<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; data: T }

export function errorMessage(e: unknown): string {
  return e instanceof ApiError ? e.message : 'エラーが起きました。しばらくしてからもう一度お試しください。'
}

/**
 * 読み込みの状態（読み込み中・失敗・成功）を返す。arg か retry が変わると読み込み直す。
 * 状態には「どの読み込みの結果か」を持たせ、今の読み込みの結果でなければ「読み込み中」とみなす
 * （日付を素早く切り替えたとき、遅れて届いた古い結果で表示が戻らないように）。
 * refresh が変わると、今の表示を残したまま裏で読み直す（「読み込み中」にしない。失敗しても、出ている内容は消さない）。
 * fetcher は、毎回作り直さない関数（ファイルの一番外で定義したもの）を渡す。
 */
export function useLoaded<A, T>(fetcher: (arg: A) => Promise<T>, arg: A, retry: number, refresh = 0): Loaded<T> {
  const key = `${String(arg)}|${retry}`
  const [result, setResult] = useState<{ key: string; value: Loaded<T> } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetcher(arg)
      .then((data) => {
        if (!cancelled) setResult({ key, value: { status: 'ok', data } })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setResult((prev) =>
          prev?.key === key && prev.value.status === 'ok' ? prev : { key, value: { status: 'error', message: errorMessage(e) } },
        )
      })
    return () => {
      cancelled = true
    }
  }, [fetcher, arg, key, refresh])

  return result !== null && result.key === key ? result.value : { status: 'loading' }
}
