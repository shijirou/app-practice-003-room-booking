import { useEffect, useRef, type KeyboardEvent } from 'react'

/** 確認ダイアログに出す内容。 */
export type ConfirmRequest = {
  /** 見出し（問いかけ） */
  title: string
  /** 見出しの下に 1 行ずつ出す、対象の説明（予約の内容など） */
  lines?: string[]
  /** 補足（元に戻せない、など） */
  note?: string
  /** 実行ボタンの文字（「予約をキャンセルする」など。「戻る」と区別がつく言い方にする） */
  confirmLabel: string
  /** 元に戻せない操作のとき true（実行ボタンが赤くなる） */
  danger?: boolean
}

type Props = {
  request: ConfirmRequest
  onAnswer: (ok: boolean) => void
}

/**
 * 画面の中央に出る確認ダイアログ（ブラウザ標準の window.confirm の代わり）。
 * HTML 標準の dialog の showModal() で開く: 背景の操作が止まり、Tab は中の 2 つのボタンの間だけを回り、読み上げにも「ダイアログ」と伝わる。
 * 開いたときは、安全な「戻る」にフォーカスする（Enter を押しても、実行してしまわない）。Esc も「戻る」。
 */
export function ConfirmDialog({ request, onAnswer }: Props) {
  const box = useRef<HTMLDialogElement>(null)
  const back = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const dialog = box.current
    if (!dialog) return
    dialog.showModal()
    back.current?.focus()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])

  const onKeyDown = (e: KeyboardEvent<HTMLDialogElement>) => {
    if (e.key !== 'Escape') return
    // 後ろの小窓まで Esc で閉じてしまわないよう、ここで止める
    e.preventDefault()
    e.stopPropagation()
    onAnswer(false)
  }

  return (
    <dialog
      ref={box}
      className="confirm"
      role="alertdialog"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-body"
      onKeyDown={onKeyDown}
      // 標準の Esc の動き（cancel）も「戻る」にそろえる
      onCancel={(e) => {
        e.preventDefault()
        onAnswer(false)
      }}
    >
      <h2 id="confirm-title">{request.title}</h2>
      <div id="confirm-body">
        {request.lines?.map((line) => (
          <p key={line} className="confirm-line">
            {line}
          </p>
        ))}
        {request.note && <p className="confirm-note">{request.note}</p>}
      </div>
      <div className="confirm-btns">
        <button type="button" ref={back} onClick={() => onAnswer(false)}>
          戻る
        </button>
        <button type="button" className={request.danger ? 'danger' : 'primary'} onClick={() => onAnswer(true)}>
          {request.confirmLabel}
        </button>
      </div>
    </dialog>
  )
}
