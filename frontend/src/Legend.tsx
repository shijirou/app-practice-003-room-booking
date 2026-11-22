import { useCallback, useRef, useState } from 'react'
import { useDismiss } from './useDismiss'

/** 「？」を押すと出る、色の説明。 */
export default function Legend() {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(open, box, close, true)

  return (
    <div className="legendwrap" ref={box}>
      <button
        type="button"
        className="help"
        aria-label="色の説明を見る"
        title="色の説明"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        ？
      </button>
      {open && (
        <div className="legend">
          <div className="li">
            <span className="swatch free" />
            空き
          </div>
          <div className="li">
            <span className="swatch mine" />
            自分の予約
          </div>
          <div className="li">
            <span className="swatch busy" />
            ほかの人の予約
          </div>
          <div className="li">
            <span className="swatch past" />
            過去（予約できません）
          </div>
        </div>
      )}
    </div>
  )
}
