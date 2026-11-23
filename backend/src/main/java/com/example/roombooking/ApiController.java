package com.example.roombooking;

import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 画面から呼ばれる API。 */
@RestController
@RequestMapping("/api")
public class ApiController {

	public record EmployeeResponse(Long id, String name) {
	}

	public record RoomResponse(Long id, String name, int capacity) {
	}

	private final EmployeeRepository employees;
	private final RoomRepository rooms;
	private final ReservationService reservations;

	public ApiController(EmployeeRepository employees, RoomRepository rooms, ReservationService reservations) {
		this.employees = employees;
		this.rooms = rooms;
		this.reservations = reservations;
	}

	@GetMapping("/employees")
	List<EmployeeResponse> employees() {
		return employees.findAllByOrderById().stream()
				.map(e -> new EmployeeResponse(e.getId(), e.getName()))
				.toList();
	}

	@GetMapping("/rooms")
	List<RoomResponse> rooms() {
		return rooms.findAllByOrderById().stream()
				.map(r -> new RoomResponse(r.getId(), r.getName(), r.getCapacity()))
				.toList();
	}

	/** date（その日の全予約）か employeeId（その社員の今から先の予約）の、どちらか 1 つだけ付ける。 */
	@GetMapping("/reservations")
	List<ReservationResponse> reservations(
			@RequestParam(required = false) String date,
			@RequestParam(required = false) Long employeeId) {
		if (date != null && employeeId != null) {
			throw new BadRequestException("date と employeeId は、どちらか 1 つだけ指定してください");
		}
		if (date == null && employeeId == null) {
			throw new BadRequestException("date か employeeId のどちらかを指定してください");
		}
		if (employeeId != null) {
			return reservations.findUpcomingByEmployee(employeeId);
		}
		return reservations.findByDate(ReservationService.parseDate(date));
	}

	/** カレンダーの点用。from〜to（両端を含む）のうち、予約がある日と、予約した社員の番号を返す。 */
	@GetMapping("/reservation-days")
	List<ReservationService.DayReservations> reservationDays(@RequestParam String from, @RequestParam String to) {
		return reservations.findDays(ReservationService.parseDate(from), ReservationService.parseDate(to));
	}

	/** 予約を作る。成功は 201。 */
	@PostMapping("/reservations")
	@ResponseStatus(HttpStatus.CREATED)
	ReservationResponse createReservation(@RequestBody CreateReservationRequest request) {
		return reservations.create(request);
	}

	/** 予約を変更する。成功は 200。本文は作成と同じ（employeeId は、予約した本人かの確認に使う）。 */
	@PutMapping("/reservations/{id}")
	ReservationResponse updateReservation(@PathVariable Long id, @RequestBody CreateReservationRequest request) {
		return reservations.update(id, request);
	}

	/** 予約をキャンセルする（本当に消す）。成功は 204。employeeId は、予約した本人かの確認に使う。 */
	@DeleteMapping("/reservations/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void cancelReservation(@PathVariable Long id, @RequestParam(required = false) Long employeeId) {
		reservations.cancel(id, employeeId);
	}
}
