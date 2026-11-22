import { useState } from "react";
import { fetchReservationDays } from "./api";
import { calendarDays, weekdayOf } from "./time";
import { useLoaded } from "./useLoaded";

type Props = {
  /** 今見ている日 */
  date: string;
  today: string;
  /** 日付を押したとき（選んでも閉じない） */
  onSelect: (date: string) => void;
  onClose: () => void;
  /** 選んでいる社員。この人の予約の日には青い点、ほかの人の予約の日には灰色の点 */
  selfId: number | null;
  /** 予約を作ったあとなどに増やして、点を読み直す */
  reloadKey: number;
};

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** ミニカレンダー。日付を選んでも閉じず、×か外側のクリックで閉じる。 */
export default function Calendar({
  date,
  today,
  onSelect,
  onClose,
  selfId,
  reloadKey,
}: Props) {
  const [year, setYear] = useState(Number(date.slice(0, 4)));
  const [month, setMonth] = useState(Number(date.slice(5, 7)));

  const cells = calendarDays(year, month);
  const loaded = useLoaded(
    fetchReservationDays,
    `${cells[0]}~${cells[cells.length - 1]}`,
    reloadKey,
  );
  const byDate = new Map(
    (loaded.status === "ok" ? loaded.data : []).map((d) => [
      d.date,
      d.employeeIds,
    ]),
  );

  const moveMonth = (delta: number) => {
    const index = year * 12 + (month - 1) + delta;
    setYear(Math.floor(index / 12));
    setMonth((index % 12) + 1);
  };

  return (
    <dialog open className="cal" aria-label="カレンダー">
      <div className="cal-head">
        <div className="cal-title">
          {year}年{month}月
        </div>
        <button type="button" aria-label="前の月" onClick={() => moveMonth(-1)}>
          ◀
        </button>
        <button
          type="button"
          onClick={() => {
            onSelect(today);
            setYear(Number(today.slice(0, 4)));
            setMonth(Number(today.slice(5, 7)));
          }}
        >
          今日
        </button>
        <button type="button" aria-label="次の月" onClick={() => moveMonth(1)}>
          ▶
        </button>
        <span className="spacer" />
        <button
          type="button"
          className="cal-x"
          aria-label="閉じる"
          title="閉じる"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="cal-grid">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={`dow${i === 0 ? " sun" : i === 6 ? " sat" : ""}`}
          >
            {w}
          </div>
        ))}
        {cells.map((d) => {
          const dow = weekdayOf(d);
          const cls = [
            "day",
            Number(d.slice(5, 7)) !== month ? "out" : "",
            d === today ? "today" : "",
            d === date ? "sel" : "",
            dow === 0 ? "sun" : dow === 6 ? "sat" : "",
          ]
            .filter(Boolean)
            .join(" ");
          const ids = byDate.get(d) ?? [];
          const mine = ids.includes(selfId ?? -1);
          const other = ids.some((id) => id !== selfId);
          return (
            <button
              key={d}
              type="button"
              className={cls}
              data-date={d}
              onClick={() => onSelect(d)}
            >
              {Number(d.slice(8))}
              {(mine || other) && (
                <span className="dots">
                  {/* ● は左、▲ は右の決まった場所。片方だけでも位置は変わらない */}
                  <span className="slot">
                    {mine && (
                      <span className="dot mine" data-testid="dot-mine" />
                    )}
                  </span>
                  <span className="slot">
                    {other && (
                      <span className="dot other" data-testid="dot-other" />
                    )}
                  </span>
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="cal-legend">
        <span className="dot mine" />
        自分の予約
        <span className="dot other" />
        ほかの人の予約
      </div>
    </dialog>
  );
}
