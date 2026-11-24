import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import Calendar from "./Calendar";
import {
  addDays,
  formatDateLabel,
  formatMinutes,
  formatShortDate,
} from "./time";
import { useDismiss } from "./useDismiss";

type Props = {
  date: string;
  today: string;
  nowMinutes: number;
  onChange: (date: string) => void;
  selfId: number | null;
  /** 予約を作ったあとなどに増やして、カレンダーの点を読み直す */
  reloadKey: number;
  /** 日付の並びの右端に置くもの（［＋ 予約する］ボタン）。ミニカレンダーの幅（◀〜現在時刻）には含めない */
  actions?: ReactNode;
};

/** 日付を動かすバー（前の日・今日・次の日・カレンダー）と、現在時刻の表示。 */
export default function DateBar({
  date,
  today,
  nowMinutes,
  onChange,
  selfId,
  reloadKey,
  actions,
}: Props) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // カーソルが外に出たら半透明にして、予約表を透かして見られるようにする（戻ると濃くなる）
  const [faded, setFaded] = useState(false);
  const closeCalendar = useCallback(() => {
    setCalendarOpen(false);
    setFaded(false);
  }, []);
  const wakeCalendar = useCallback(() => setFaded(false), []);
  // 外側を押したら閉じる。ただし下の欄のタブ・予約カード・ボタンと、小窓の中を押したときは、閉じずに操作を通す（白い背景部分は閉じる）
  useDismiss(calendarOpen, box, closeCalendar, true, ".lists button, .pop");

  const away = date !== today;

  // 別の日を見ているとき、現在時刻の枠は「今日 11/20(金)」の分だけ右へ伸びる（黄色い枠）。
  // ミニカレンダーの幅は、いつも「現在 ○:○○」だけの枠の右端に合わせる（伸びた分は、右の端から引く）。
  // 横に伸びると、日付どうしの間が開くだけなので。
  const nav = useRef<HTMLDivElement>(null);
  const clock = useRef<HTMLSpanElement>(null);
  const base = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const navEl = nav.current;
    const clockEl = clock.current;
    const baseEl = base.current;
    if (!navEl || !clockEl || !baseEl) return;
    const style = getComputedStyle(clockEl);
    const baseRight =
      baseEl.getBoundingClientRect().right +
      parseFloat(style.paddingRight) +
      parseFloat(style.borderRightWidth);
    const extra = away ? navEl.getBoundingClientRect().right - baseRight : 0;
    navEl.style.setProperty("--cal-trim", `${Math.max(0, extra)}px`);
  }, [away, nowMinutes, date, today]);

  return (
    <div className="datebar">
      {/* 「◀ 今日 ▶ 日付 現在時刻」をまとめる。ミニカレンダーは、この枠の左右の端（◀ の左端〜現在時刻の右端）に合わせて開く */}
      <div className="navgroup" ref={nav}>
        <button
          type="button"
          aria-label="前の日"
          onClick={() => onChange(addDays(date, -1))}
        >
          ◀
        </button>
        <button type="button" onClick={() => onChange(today)}>
          今日
        </button>
        <button
          type="button"
          aria-label="次の日"
          onClick={() => onChange(addDays(date, 1))}
        >
          ▶
        </button>
        <div className="dategroup">
          <div
            className="datewrap"
            ref={box}
            onMouseEnter={wakeCalendar}
            onMouseLeave={() => setFaded(calendarOpen)}
          >
            <button
              type="button"
              className="datepick"
              title="押すとカレンダーを開きます"
              aria-haspopup="dialog"
              aria-expanded={calendarOpen}
              onClick={() => {
                setFaded(false);
                setCalendarOpen((open) => !open);
              }}
            >
              <span className="label">{formatDateLabel(date)}</span>
              <span aria-hidden="true">📅</span>
            </button>
            {calendarOpen && (
              <Calendar
                date={date}
                today={today}
                onSelect={onChange}
                onClose={closeCalendar}
                faded={faded}
                selfId={selfId}
                reloadKey={reloadKey}
              />
            )}
          </div>
          <span className={`clock${away ? " away" : ""}`} ref={clock}>
            <span ref={base}>現在 {formatMinutes(nowMinutes)}</span>
            {away && <span className="clock-extra">今日 {formatShortDate(today)}</span>}
          </span>
        </div>
      </div>
      {actions && <div className="datebar-actions">{actions}</div>}
    </div>
  );
}
