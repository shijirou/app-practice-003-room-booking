package com.example.roombooking;

import java.time.OffsetDateTime;

/** 予約を作る依頼（POST /api/reservations の本文）。日時は +09:00 などの時差つきで受け取る。 */
public record CreateReservationRequest(
		Long employeeId,
		Long roomId,
		OffsetDateTime startAt,
		OffsetDateTime endAt,
		String purpose) {
}
