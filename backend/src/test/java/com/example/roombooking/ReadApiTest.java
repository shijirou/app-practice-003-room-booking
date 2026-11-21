package com.example.roombooking;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/** 「見るだけ」の API（社員・会議室・日付ごとの予約）を、本物の PostgreSQL で確かめる。 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class ReadApiTest {

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcTemplate jdbc;

	long roomA;
	long roomB;
	long tanaka;

	@BeforeEach
	void setUp() {
		jdbc.update("DELETE FROM reservation");
		roomA = jdbc.queryForObject("SELECT id FROM room WHERE name = '会議室A'", Long.class);
		roomB = jdbc.queryForObject("SELECT id FROM room WHERE name = '会議室B'", Long.class);
		tanaka = jdbc.queryForObject("SELECT id FROM employee WHERE name = '田中架空'", Long.class);
	}

	private void insert(long room, String start, String end, String purpose) {
		jdbc.update("INSERT INTO reservation (room_id, employee_id, start_at, end_at, purpose) VALUES (?, ?, ?::timestamptz, ?::timestamptz, ?)",
				room, tanaka, start, end, purpose);
	}

	@Test
	void 社員一覧は六人を番号順で返す() throws Exception {
		mvc.perform(get("/api/employees"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(6))
				.andExpect(jsonPath("$[0].name").value("田中架空"))
				.andExpect(jsonPath("$[0].id").isNumber());
	}

	@Test
	void 会議室一覧は四室を定員つきで返す() throws Exception {
		mvc.perform(get("/api/rooms"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(4))
				.andExpect(jsonPath("$[0].name").value("会議室A"))
				.andExpect(jsonPath("$[0].capacity").value(4));
	}

	@Test
	void 日付を指定すると日本時間のその日の予約だけを開始順に返す() throws Exception {
		insert(roomB, "2026-12-01T13:00:00+09:00", "2026-12-01T14:00:00+09:00", null);
		insert(roomA, "2026-12-01T10:00:00+09:00", "2026-12-01T11:00:00+09:00", "営業定例");
		// 別の日（前日の最後・翌日の最初）は含まれない
		insert(roomA, "2026-11-30T19:30:00+09:00", "2026-11-30T20:00:00+09:00", null);
		insert(roomA, "2026-12-02T08:00:00+09:00", "2026-12-02T09:00:00+09:00", null);

		mvc.perform(get("/api/reservations").param("date", "2026-12-01"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(2))
				.andExpect(jsonPath("$[0].roomId").value(roomA))
				.andExpect(jsonPath("$[0].employeeId").value(tanaka))
				.andExpect(jsonPath("$[0].employeeName").value("田中架空"))
				.andExpect(jsonPath("$[0].startAt").value("2026-12-01T10:00:00+09:00"))
				.andExpect(jsonPath("$[0].endAt").value("2026-12-01T11:00:00+09:00"))
				.andExpect(jsonPath("$[0].purpose").value("営業定例"))
				.andExpect(jsonPath("$[1].roomId").value(roomB))
				.andExpect(jsonPath("$[1].purpose").doesNotExist());
	}

	@Test
	void 予約がない日は空の配列を返す() throws Exception {
		mvc.perform(get("/api/reservations").param("date", "2026-12-01"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(0));
	}

	@Test
	void dateもemployeeIdもないと400() throws Exception {
		mvc.perform(get("/api/reservations"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.message").value("date を指定してください"));
	}

	@Test
	void 両方あると400() throws Exception {
		mvc.perform(get("/api/reservations").param("date", "2026-12-01").param("employeeId", "1"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.message").isNotEmpty());
	}

	@Test
	void 日付の形が違うと400() throws Exception {
		mvc.perform(get("/api/reservations").param("date", "2026/12/01"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.message").value("日付は 2026-11-20 の形で指定してください"));
		mvc.perform(get("/api/reservations").param("date", "2026-02-30"))
				.andExpect(status().isBadRequest());
	}
}
