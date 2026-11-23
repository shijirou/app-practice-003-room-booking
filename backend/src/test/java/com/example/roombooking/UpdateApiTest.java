package com.example.roombooking;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** 予約を変更する API（PUT /api/reservations/{id}）を、本物の PostgreSQL で確かめる。 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class UpdateApiTest {

	private static final ZoneId TOKYO = ZoneId.of("Asia/Tokyo");

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcTemplate jdbc;

	long roomA;
	long roomB;
	long tanaka;
	long other;
	String tomorrow;

	@BeforeEach
	void setUp() {
		jdbc.update("DELETE FROM reservation");
		roomA = jdbc.queryForObject("SELECT id FROM room WHERE name = '会議室A'", Long.class);
		roomB = jdbc.queryForObject("SELECT id FROM room WHERE name = '会議室B'", Long.class);
		tanaka = jdbc.queryForObject("SELECT id FROM employee WHERE name = '田中架空'", Long.class);
		other = jdbc.queryForObject("SELECT id FROM employee WHERE id <> ? ORDER BY id LIMIT 1", Long.class, tanaka);
		tomorrow = LocalDate.now(TOKYO).plusDays(1).toString();
	}

	private String at(String date, String time) {
		return date + "T" + time + "+09:00";
	}

	/** DB に直接予約を入れて、その id を返す（API の検査を通らない過去の予約も作れる）。 */
	private long insert(long room, long employee, String date, String start, String end, String purpose) {
		return jdbc.queryForObject("""
				INSERT INTO reservation (room_id, employee_id, start_at, end_at, purpose)
				VALUES (?, ?, ?::timestamptz, ?::timestamptz, ?) RETURNING id
				""", Long.class, room, employee, at(date, start), at(date, end), purpose);
	}

	private ResultActions update(long id, long employee, long room, String date, String start, String end,
			String purpose) throws Exception {
		var purposeJson = purpose == null ? "null" : "\"" + purpose + "\"";
		var json = """
				{"employeeId": %d, "roomId": %d, "startAt": "%s", "endAt": "%s", "purpose": %s}
				""".formatted(employee, room, at(date, start), at(date, end), purposeJson);
		return mvc.perform(put("/api/reservations/" + id).contentType(MediaType.APPLICATION_JSON).content(json));
	}

	@Test
	void 会議室_時間_用件を変えると200で直した予約を返し_DBも変わる() throws Exception {
		var id = insert(roomA, tanaka, tomorrow, "10:00:00", "11:00:00", "営業定例");

		update(id, tanaka, roomB, tomorrow, "13:00:00", "14:30:00", "  商談  ")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.id").value(id))
				.andExpect(jsonPath("$.roomId").value(roomB))
				.andExpect(jsonPath("$.employeeId").value(tanaka))
				.andExpect(jsonPath("$.startAt").value(at(tomorrow, "13:00:00")))
				.andExpect(jsonPath("$.endAt").value(at(tomorrow, "14:30:00")))
				.andExpect(jsonPath("$.purpose").value("商談"));

		assertThat(jdbc.queryForObject("SELECT room_id FROM reservation WHERE id = ?", Long.class, id)).isEqualTo(roomB);
		assertThat(jdbc.queryForObject("SELECT purpose FROM reservation WHERE id = ?", String.class, id)).isEqualTo("商談");
		assertThat(jdbc.queryForObject("SELECT count(*) FROM reservation", Integer.class)).isEqualTo(1);
	}

	@Test
	void 自分の古い時間と重なるずらし方でも変更できる() throws Exception {
		var id = insert(roomA, tanaka, tomorrow, "10:00:00", "11:00:00", null);

		update(id, tanaka, roomA, tomorrow, "10:30:00", "11:30:00", null).andExpect(status().isOk());
		update(id, tanaka, roomA, tomorrow, "10:30:00", "11:30:00", "同じ時間のまま用件だけ").andExpect(status().isOk());
	}

	@Test
	void ほかの予約と重なると409_元の予約はそのまま() throws Exception {
		var id = insert(roomA, tanaka, tomorrow, "10:00:00", "11:00:00", "元");
		insert(roomA, other, tomorrow, "12:00:00", "13:00:00", null);

		update(id, tanaka, roomA, tomorrow, "11:30:00", "12:30:00", "変更")
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.message").value("その時間はすでに予約があります"));
		assertThat(jdbc.queryForObject("SELECT purpose FROM reservation WHERE id = ?", String.class, id)).isEqualTo("元");

		// 隣り合うのは重ならない
		update(id, tanaka, roomA, tomorrow, "11:00:00", "12:00:00", "変更").andExpect(status().isOk());
	}

	@Test
	void 本人でないと403_存在しないと404() throws Exception {
		var id = insert(roomA, tanaka, tomorrow, "10:00:00", "11:00:00", "元");

		update(id, other, roomA, tomorrow, "14:00:00", "15:00:00", "のっとり")
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.message").value("ほかの人の予約は変更できません"));
		assertThat(jdbc.queryForObject("SELECT purpose FROM reservation WHERE id = ?", String.class, id)).isEqualTo("元");

		update(id + 1000, tanaka, roomA, tomorrow, "14:00:00", "15:00:00", null)
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.message").value("予約が見つかりません"));
		update(id, tanaka, 999999, tomorrow, "14:00:00", "15:00:00", null)
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.message").value("会議室が見つかりません"));
	}

	@Test
	void 始まった予約は400で変更できない() throws Exception {
		var yesterday = LocalDate.now(TOKYO).minusDays(1).toString();
		var id = insert(roomA, tanaka, yesterday, "10:00:00", "11:00:00", "終わった");

		update(id, tanaka, roomA, tomorrow, "10:00:00", "11:00:00", null)
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.message").value("始まった予約は変更できません"));
	}

	@Test
	void 時間の決まりに反すると400_元の予約はそのまま() throws Exception {
		var id = insert(roomA, tanaka, tomorrow, "10:00:00", "11:00:00", "元");
		var yesterday = LocalDate.now(TOKYO).minusDays(1).toString();

		update(id, tanaka, roomA, tomorrow, "10:15:00", "11:00:00", null).andExpect(status().isBadRequest());
		update(id, tanaka, roomA, tomorrow, "10:00:00", "15:00:00", null)
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.message").value("1 件の予約は 4 時間までです"));
		update(id, tanaka, roomA, yesterday, "10:00:00", "11:00:00", null)
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.message").value("過去の時間は予約できません"));
		update(id, tanaka, roomA, tomorrow, "10:00:00", "11:00:00", "あ".repeat(51))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.message").value(containsString("50 文字")));
		assertThat(jdbc.queryForObject("SELECT purpose FROM reservation WHERE id = ?", String.class, id)).isEqualTo("元");
	}
}
