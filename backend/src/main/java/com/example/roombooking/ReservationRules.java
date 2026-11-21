package com.example.roombooking;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;

/**
 * 予約の時間の決まりごと（docs/requirements.md の決定事項 5・8・9・11・12）。
 * 守られていなければ BadRequestException（400）にする。「今」が要る決まりは、DB ではなくここで守る。
 */
public class ReservationRules {

	static final ZoneId TOKYO = ZoneId.of("Asia/Tokyo");
	static final LocalTime OPEN = LocalTime.of(8, 0);
	static final LocalTime CLOSE = LocalTime.of(20, 0);
	static final int UNIT_MINUTES = 30;
	static final Duration MAX_LENGTH = Duration.ofHours(4);
	static final int MAX_DAYS_AHEAD = 90;
	static final int MAX_PURPOSE_LENGTH = 50;

	private final Clock clock;

	public ReservationRules(Clock clock) {
		this.clock = clock;
	}

	/** 時間を検査する。 */
	public void checkTime(OffsetDateTime startAt, OffsetDateTime endAt) {
		if (startAt == null || endAt == null) {
			throw new BadRequestException("開始と終了の日時を指定してください");
		}
		var start = startAt.atZoneSameInstant(TOKYO);
		var end = endAt.atZoneSameInstant(TOKYO);

		if (!onUnit(start) || !onUnit(end)) {
			throw new BadRequestException("時刻は 30 分刻み（00 分か 30 分）で指定してください");
		}
		if (!end.isAfter(start)) {
			throw new BadRequestException("終了は開始より後にしてください");
		}
		if (!start.toLocalDate().equals(end.toLocalDate())) {
			throw new BadRequestException("日付をまたぐ予約はできません");
		}
		if (start.toLocalTime().isBefore(OPEN) || end.toLocalTime().isAfter(CLOSE)) {
			throw new BadRequestException("予約できる時間は 8:00〜20:00 です");
		}
		if (Duration.between(start, end).compareTo(MAX_LENGTH) > 0) {
			throw new BadRequestException("1 件の予約は 4 時間までです");
		}
		if (start.isBefore(earliestStart())) {
			throw new BadRequestException("過去の時間は予約できません");
		}
		if (start.toLocalDate().isAfter(today().plusDays(MAX_DAYS_AHEAD))) {
			throw new BadRequestException("予約できるのは今日から 90 日先までです");
		}
	}

	/** 用件を整える。前後の空白を除き、空なら null。50 文字を超えたら 400。 */
	public String cleanPurpose(String purpose) {
		if (purpose == null) {
			return null;
		}
		var text = purpose.strip();
		if (text.isEmpty()) {
			return null;
		}
		if (text.codePointCount(0, text.length()) > MAX_PURPOSE_LENGTH) {
			throw new BadRequestException("用件は 50 文字までです");
		}
		return text;
	}

	/** 今日（日本時間）。 */
	LocalDate today() {
		return clock.instant().atZone(TOKYO).toLocalDate();
	}

	/** 予約を始められる最も早い時刻。今の時刻を、30 分単位で切り上げる（画面の「過去」の枠と同じ決まり）。 */
	ZonedDateTime earliestStart() {
		var now = clock.instant().atZone(TOKYO).truncatedTo(ChronoUnit.MINUTES);
		var rest = now.getMinute() % UNIT_MINUTES;
		return rest == 0 ? now : now.plusMinutes(UNIT_MINUTES - rest);
	}

	private static boolean onUnit(ZonedDateTime time) {
		return time.getMinute() % UNIT_MINUTES == 0 && time.getSecond() == 0 && time.getNano() == 0;
	}
}
