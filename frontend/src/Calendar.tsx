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
  /** 外側を押されて半透明になっているか（カーソルを重ねて戻す処理は、外側の DateBar が持つ） */
  faded: boolean;
  /** 選んでいる社員。この人の予約の日には青い点、ほかの人の予約の日には灰色の点 */
  selfId: number | null;
  /** 予約を作ったあとなどに増やして、点を読み直す */
  reloadKey: number;
};

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** ミニカレンダー。日付を選んでも閉じず、×・Esc・日付ボタン・外側のクリックで閉じる。カーソルが外に出ると半透明になる。 */
export default function Calendar({
  date,
  today,
  onSelect,
  onClose,
  faded,
  selfId,
  reloadKey,
}: Props) {
  const [year, setYear] = useState(Number(date.slice(0, 4)));
  const [month, setMonth] = useState(Number(date.slice(5, 7)));
  // 選んでいる日が変わったら（下の欄を押したときなど）、表示する月もその月に合わせる
  const [shownDate, setShownDate] = useState(date);
  if (date !== shownDate) {
    setShownDate(date);
    setYear(Number(date.slice(0, 4)));
    setMonth(Number(date.slice(5, 7)));
  }

  // 翌月の日だけの週（最終行）は出さない。行数が多い月は、マスを縮めて全体の高さをおさえる
  const all = calendarDays(year, month);
  const weekCount = Array.from({ length: 6 }, (_, w) =>
    all.slice(w * 7, w * 7 + 7),
  ).filter((week) => week.some((d) => Number(d.slice(5, 7)) === month)).length;
  const cells = all.slice(0, weekCount * 7);
  const rowHeight = weekCount <= 4 ? 40 : weekCount === 5 ? 36 : 30;
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
    <dialog
      open
      className={`cal${faded ? " faded" : ""}`}
      aria-label="カレンダー"
    >
      <div className="cal-head">
        <button type="button" aria-label="前の月" onClick={() => moveMonth(-1)}>
          ◀
        </button>
        <button
          type="button"
          title="カレンダーを今月に戻します（選んでいる日付は変わりません）"
          onClick={() => {
            setYear(Number(today.slice(0, 4)));
            setMonth(Number(today.slice(5, 7)));
          }}
        >
          今月
        </button>
        <button type="button" aria-label="次の月" onClick={() => moveMonth(1)}>
          ▶
        </button>
        <div className="cal-title">
          {year}年{month}月
        </div>
        <span className="spacer" />
        <div className="cal-legend">
          <span className="dot mine" />
          自分の予約
          <span className="dot other" />
          ほかの人の予約
        </div>
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
      <div
        className={`cal-grid${weekCount >= 6 ? " dense" : ""}`}
        style={{ "--row-h": `${rowHeight}px` } as React.CSSProperties}
      >
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
    </dialog>
  );
}
