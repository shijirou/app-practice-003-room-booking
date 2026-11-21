package com.example.roombooking;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

/** 予約を画面に返す形。日時は日本時間（+09:00）で返す。 */
public record ReservationResponse(
		Long id,
		Long roomId,
		Long employeeId,
		String employeeName,
		OffsetDateTime startAt,
		OffsetDateTime endAt,
		String purpose) {

	private static final ZoneOffset JST = ZoneOffset.ofHours(9);

	/** DB から読むときに使う（DB の日時は世界共通の時刻なので、日本時間に直す）。 */
	public ReservationResponse(Long id, Long roomId, Long employeeId, String employeeName,
			Instant startAt, Instant endAt, String purpose) {
		this(id, roomId, employeeId, employeeName, startAt.atOffset(JST), endAt.atOffset(JST), purpose);
	}
}
