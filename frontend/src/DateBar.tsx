import { useCallback, useRef, useState } from "react";
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
};

/** 日付を動かすバー（前の日・今日・次の日・カレンダー）と、現在時刻の表示。 */
export default function DateBar({
  date,
  today,
  nowMinutes,
  onChange,
  selfId,
  reloadKey,
}: Props) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const closeCalendar = useCallback(() => setCalendarOpen(false), []);
  useDismiss(calendarOpen, box, closeCalendar, true);

  const away = date !== today;
  return (
    <div className="datebar">
      {/* 「◀ 今日 ▶ 日付 現在時刻」をまとめる。ミニカレンダーは、この枠の左右の端（◀ の左端〜現在時刻の右端）に合わせて開く */}
      <div className="navgroup">
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
          <div className="datewrap" ref={box}>
            <button
              type="button"
              className="datepick"
              title="押すとカレンダーを開きます"
              aria-haspopup="dialog"
              aria-expanded={calendarOpen}
              onClick={() => setCalendarOpen((open) => !open)}
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
                selfId={selfId}
                reloadKey={reloadKey}
              />
            )}
          </div>
          <span className={`clock${away ? " away" : ""}`}>
            {away
              ? `現在 ${formatMinutes(nowMinutes)}　今日 ${formatShortDate(today)}`
              : `現在 ${formatMinutes(nowMinutes)}`}
          </span>
        </div>
      </div>
    </div>
  );
}
