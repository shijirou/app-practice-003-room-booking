package com.example.roombooking;

import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 画面から呼ばれる「見るだけ」の API。 */
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

	/** date か employeeId のどちらか 1 つだけ付ける。employeeId（自分の予約）は縦切り 3 で作る。 */
	@GetMapping("/reservations")
	List<ReservationResponse> reservations(
			@RequestParam(required = false) String date,
			@RequestParam(required = false) Long employeeId) {
		if (date != null && employeeId != null) {
			throw new BadRequestException("date と employeeId は、どちらか 1 つだけ指定してください");
		}
		if (date == null) {
			throw new BadRequestException(employeeId == null
					? "date を指定してください"
					: "employeeId での検索は、まだ使えません");
		}
		return reservations.findByDate(ReservationService.parseDate(date));
	}
}
