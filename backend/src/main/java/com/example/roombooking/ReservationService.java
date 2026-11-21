package com.example.roombooking;

import java.time.Clock;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ReservationService {

	private static final ZoneId TOKYO = ZoneId.of("Asia/Tokyo");

	private final ReservationRepository reservations;
	private final EmployeeRepository employees;
	private final Clock clock;

	public ReservationService(ReservationRepository reservations, EmployeeRepository employees, Clock clock) {
		this.reservations = reservations;
		this.employees = employees;
		this.clock = clock;
	}

	/** その社員の、今から先（進行中を含む）の予約を、開始の早い順に返す。社員がいなければ 404。 */
	@Transactional(readOnly = true)
	public List<ReservationResponse> findUpcomingByEmployee(Long employeeId) {
		if (!employees.existsById(employeeId)) {
			throw new NotFoundException("社員が見つかりません");
		}
		return reservations.findNotFinishedByEmployee(employeeId, clock.instant());
	}

	/** 日本時間のその日に始まる予約を、開始の早い順に返す。 */
	@Transactional(readOnly = true)
	public List<ReservationResponse> findByDate(LocalDate date) {
		var from = date.atStartOfDay(TOKYO).toInstant();
		var to = date.plusDays(1).atStartOfDay(TOKYO).toInstant();
		return reservations.findStartingBetween(from, to);
	}

	/** "2026-11-20" の形の文字を日付にする。形が違えば 400。 */
	static LocalDate parseDate(String text) {
		try {
			return LocalDate.parse(text);
		} catch (DateTimeException e) {
			throw new BadRequestException("日付は 2026-11-20 の形で指定してください");
		}
	}
}
