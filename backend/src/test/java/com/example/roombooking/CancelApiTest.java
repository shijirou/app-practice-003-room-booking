package com.example.roombooking;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.time.ZoneId;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/** 予約をキャンセルする API（DELETE /api/reservations/{id}）を、本物の PostgreSQL で確かめる。 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class CancelApiTest {

	private static final ZoneId TOKYO = ZoneId.of("Asia/Tokyo");

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcTemplate jdbc;

	long roomA;
	long tanaka;
	long other;
	String tomorrow;

	@BeforeEach
	void setUp() {
		jdbc.update("DELETE FROM reservation");
		roomA = jdbc.queryForObject("SELECT id FROM room WHERE name = '会議室A'", Long.class);
		tanaka = jdbc.queryForObject("SELECT id FROM employee WHERE name = '田中架空'", Long.class);
		other = jdbc.queryForObject("SELECT id FROM employee WHERE id <> ? ORDER BY id LIMIT 1", Long.class, tanaka);
		tomorrow = LocalDate.now(TOKYO).plusDays(1).toString();
	}

	private long insert(long employee, String date, String start, String end) {
		return jdbc.queryForObject("""
				INSERT INTO reservation (room_id, employee_id, start_at, end_at)
				VALUES (?, ?, ?::timestamptz, ?::timestamptz) RETURNING id
				""", Long.class, roomA, employee, date + "T" + start + "+09:00", date + "T" + end + "+09:00");
	}

	private int count() {
		return jdbc.queryForObject("SELECT count(*) FROM reservation", Integer.class);
	}

	@Test
	void 本人が始まる前の予約をキャンセルすると204で消える() throws Exception {
		var id = insert(tanaka, tomorrow, "10:00:00", "11:00:00");
		var keep = insert(tanaka, tomorrow, "13:00:00", "14:00:00");

		mvc.perform(delete("/api/reservations/" + id).param("employeeId", String.valueOf(tanaka)))
				.andExpect(status().isNoContent());

		assertThat(count()).isEqualTo(1);
		assertThat(jdbc.queryForObject("SELECT id FROM reservation", Long.class)).isEqualTo(keep);

		// 消した枠は、また予約できる（重複の対象から外れる）
		insert(other, tomorrow, "10:00:00", "11:00:00");
	}

	@Test
	void 本人でないと403_存在しないと404_社員の指定がないと400_どれも消えない() throws Exception {
		var id = insert(tanaka, tomorrow, "10:00:00", "11:00:00");

		mvc.perform(delete("/api/reservations/" + id).param("employeeId", String.valueOf(other)))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.message").value("ほかの人の予約はキャンセルできません"));
		mvc.perform(delete("/api/reservations/" + (id + 1000)).param("employeeId", String.valueOf(tanaka)))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.message").value("予約が見つかりません"));
		mvc.perform(delete("/api/reservations/" + id))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.message").value("社員を指定してください"));
		assertThat(count()).isEqualTo(1);
	}

	@Test
	void 始まった予約は400でキャンセルできない() throws Exception {
		var yesterday = LocalDate.now(TOKYO).minusDays(1).toString();
		var id = insert(tanaka, yesterday, "10:00:00", "11:00:00");

		mvc.perform(delete("/api/reservations/" + id).param("employeeId", String.valueOf(tanaka)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.message").value("始まった予約はキャンセルできません"));
		assertThat(count()).isEqualTo(1);
	}
}
