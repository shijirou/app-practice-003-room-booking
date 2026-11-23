import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { formatMinutes } from './time'

type Props = {
  /** 欄の名前（「開始」「終了」）。標準の選択欄の aria-label になる */
  label: string
  /** いま決まっている時刻（0 時からの分） */
  value: number
  /** 選べる時刻の一覧 */
  times: number[]
  /** その時刻を選ぶと予約できなくなるか（4 時間を超える・過去など）。赤く表示する */
  isInvalid?: (value: number) => boolean
  /** 決定したとき */
  onChange: (value: number) => void
  /**
   * リストの時刻にカーソルを合わせている間（まだ決定していない間）に、その時刻を知らせる。
   * リストを閉じる・取り消したときは null（元に戻す）。表の青枠を連動させるために使う
   */
  onPreview: (value: number | null) => void
}

/**
 * 時刻を選ぶ欄。中身は標準の選択欄（キーボードの矢印・読み上げ・値の確認はそのまま使える）のままにして、
 * マウスで押したときと、Space・Alt + ↓ で開くときだけ、ブラウザ標準のリストの代わりに自作のリストを出す。
 * 自作のリストは、時刻にカーソルを合わせる（↑ ↓ で選ぶ）たびに onPreview で知らせる。
 */
export default function TimeSelect({ label, value, times, isInvalid, onChange, onPreview }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const select = useRef<HTMLSelectElement>(null)
  const [open, setOpen] = useState(false)
  // リストの中で、いま選ばれている（カーソルが合っている）時刻
  const [highlight, setHighlight] = useState(value)

  // 最新の onPreview を、取り外されるとき（小窓が閉じたとき）の後片付けでも使う
  const previewRef = useRef(onPreview)
  useEffect(() => {
    previewRef.current = onPreview
  })
  useEffect(() => () => previewRef.current(null), [])

  const close = () => {
    setOpen(false)
    onPreview(null)
  }
  const commit = (next: number) => {
    setOpen(false)
    onPreview(null)
    if (next !== value) onChange(next)
    select.current?.focus()
  }
  const show = (time: number) => {
    setHighlight(time)
    onPreview(time)
  }

  // 開いたら、いまの時刻が見える位置までリストを動かす
  useEffect(() => {
    if (!open) return
    box.current?.querySelector<HTMLElement>('[data-current="true"]')?.scrollIntoView?.({ block: 'nearest' })
  }, [open])

  // 欄とリストの外を押したら、決定せずに閉じる
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  })

  // リストの中でカーソルが動いたとき、動いたあとの時刻をリストの見える範囲に入れる
  const keepVisible = (time: number) => {
    box.current?.querySelector<HTMLElement>(`[data-time="${time}"]`)?.scrollIntoView?.({ block: 'nearest' })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLSelectElement>) => {
    if (!open) {
      // 閉じている間の矢印キーは、標準の動き（1 つ変えるたびに change が起き、青枠も動く）
      if (e.key === ' ' || (e.altKey && e.key === 'ArrowDown')) {
        e.preventDefault()
        setHighlight(value)
        setOpen(true)
      }
      return
    }
    const index = times.indexOf(highlight)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = times[Math.min(times.length - 1, Math.max(0, index + (e.key === 'ArrowDown' ? 1 : -1)))]
      show(next)
      keepVisible(next)
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      const next = times[e.key === 'Home' ? 0 : times.length - 1]
      show(next)
      keepVisible(next)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      commit(highlight)
    } else if (e.key === 'Escape') {
      // 小窓ごと閉じてしまわないよう、ここで止める
      e.preventDefault()
      e.stopPropagation()
      close()
    } else if (e.key === 'Tab') {
      close()
    }
  }

  return (
    <div className="timesel" ref={box}>
      <select
        ref={select}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onMouseDown={(e) => {
          if (e.button !== 0) return
          // ブラウザ標準のリストは出さず、自作のリストを出す
          e.preventDefault()
          select.current?.focus()
          if (open) close()
          else {
            setHighlight(value)
            setOpen(true)
          }
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (open) close()
        }}
      >
        {times.map((m) => (
          <option key={m} value={m}>
            {formatMinutes(m)}
          </option>
        ))}
      </select>
      {open && (
        // 見た目の補助。読み上げやキーボードは、上の標準の選択欄が受け持つ
        <ul
          className="timelist"
          aria-hidden="true"
          onMouseLeave={() => onPreview(null)}
          // スクロールバー・すき間を押したり、つまんで動かしたりしても、キーボードの位置が欄から外れて閉じてしまわないようにする
          onMouseDown={(e) => e.preventDefault()}
        >
          {times.map((m) => (
            <li key={m} data-time={m} data-current={m === value}>
              <button
                type="button"
                tabIndex={-1}
                className={`${m === value ? 'cur' : ''}${m === highlight ? ' hl' : ''}${isInvalid?.(m) ? ' bad' : ''}`.trim()}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => show(m)}
                onClick={() => commit(m)}
              >
                {formatMinutes(m)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
