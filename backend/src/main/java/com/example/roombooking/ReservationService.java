package com.example.roombooking;

import java.time.Clock;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.TreeMap;
import java.util.TreeSet;
import java.time.temporal.ChronoUnit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ReservationService {

	static final String OVERLAP_MESSAGE = "その時間はすでに予約があります";

	private static final ZoneId TOKYO = ZoneId.of("Asia/Tokyo");

	private final ReservationRepository reservations;
	private final EmployeeRepository employees;
	private final RoomRepository rooms;
	private final Clock clock;
	private final ReservationRules rules;

	public ReservationService(ReservationRepository reservations, EmployeeRepository employees,
			RoomRepository rooms, Clock clock) {
		this.reservations = reservations;
		this.employees = employees;
		this.rooms = rooms;
		this.clock = clock;
		this.rules = new ReservationRules(clock);
	}

	/**
	 * 予約を作る。入力が決まりに反すれば 400、社員・会議室がなければ 404、重なる予約があれば 409。
	 * Java で重なりを調べても、同時に押されるとすり抜けるので、DB の排他制約が最後の砦になる
	 * （その拒否は ApiExceptionHandler が 409 に変える）。
	 */
	@Transactional
	public ReservationResponse create(CreateReservationRequest request) {
		if (request == null || request.employeeId() == null || request.roomId() == null) {
			throw new BadRequestException("社員と会議室を指定してください");
		}
		rules.checkTime(request.startAt(), request.endAt());
		var purpose = rules.cleanPurpose(request.purpose());

		var employee = employees.findById(request.employeeId())
				.orElseThrow(() -> new NotFoundException("社員が見つかりません"));
		var room = rooms.findById(request.roomId())
				.orElseThrow(() -> new NotFoundException("会議室が見つかりません"));

		var start = request.startAt().toInstant();
		var end = request.endAt().toInstant();
		if (reservations.existsOverlap(room.getId(), start, end)) {
			throw new ConflictException(OVERLAP_MESSAGE);
		}
		var saved = reservations.saveAndFlush(new Reservation(room, employee, start, end, purpose));
		return new ReservationResponse(saved.getId(), room.getId(), employee.getId(), employee.getName(),
				start, end, purpose);
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

	/** 予約がある日ごとの、予約した社員の番号の一覧（カレンダーの点用）。 */
	public record DayReservations(LocalDate date, List<Long> employeeIds) {
	}

	private static final int MAX_DAYS = 62;

	/** from〜to（両端を含む）の日のうち、予約がある日だけを日付順に返す。期間は 62 日まで。 */
	@Transactional(readOnly = true)
	public List<DayReservations> findDays(LocalDate from, LocalDate to) {
		if (to.isBefore(from)) {
			throw new BadRequestException("from は to と同じか、それより前の日にしてください");
		}
		if (ChronoUnit.DAYS.between(from, to) >= MAX_DAYS) {
			throw new BadRequestException("期間は " + MAX_DAYS + " 日までにしてください");
		}
		var found = reservations.findStartingBetween(from.atStartOfDay(TOKYO).toInstant(),
				to.plusDays(1).atStartOfDay(TOKYO).toInstant());
		var byDate = new TreeMap<LocalDate, TreeSet<Long>>();
		for (var r : found) {
			byDate.computeIfAbsent(r.startAt().toLocalDate(), d -> new TreeSet<>()).add(r.employeeId());
		}
		return byDate.entrySet().stream()
				.map(e -> new DayReservations(e.getKey(), List.copyOf(e.getValue())))
				.toList();
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
