package com.example.roombooking;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
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

/** 予約を作る API（POST /api/reservations）を、本物の PostgreSQL で確かめる。日付は「明日」などの相対で作る。 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class CreateApiTest {

	private static final ZoneId TOKYO = ZoneId.of("Asia/Tokyo");

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcTemplate jdbc;

	long roomA;
	long roomB;
	long tanaka;
	String tomorrow;

	@BeforeEach
	void setUp() {
		jdbc.update("DELETE FROM reservation");
		roomA = jdbc.queryForObject("SELECT id FROM room WHERE name = '会議室A'", Long.class);
		roomB = jdbc.queryForObject("SELECT id FROM room WHERE name = '会議室B'", Long.class);
		tanaka = jdbc.queryForObject("SELECT id FROM employee WHERE name = '田中架空'", Long.class);
		tomorrow = LocalDate.now(TOKYO).plusDays(1).toString();
	}

	private String at(String date, String time) {
		return date + "T" + time + "+09:00";
	}

	private String body(long employeeId, long roomId, String start, String end, String purpose) {
		var purposeJson = purpose == null ? "null" : "\"" + purpose + "\"";
		return """
				{"employeeId": %d, "roomId": %d, "startAt": "%s", "endAt": "%s", "purpose": %s}
				""".formatted(employeeId, roomId, start, end, purposeJson);
	}

	private ResultActions create(String json) throws Exception {
		return mvc.perform(post("/api/reservations").contentType(MediaType.APPLICATION_JSON).content(json));
	}

	private ResultActions create(long roomId, String date, String start, String end) throws Exception {
		return create(body(tanaka, roomId, at(date, start), at(date, end), "営業定例"));
	}

	private int count() {
		return jdbc.queryForObject("SELECT count(*) FROM reservation", Integer.class);
	}

	@Test
	void 予約を作ると201で作った予約を返し_一覧にも出る() throws Exception {
		create(roomA, tomorrow, "10:00:00", "11:30:00")
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.id").isNumber())
				.andExpect(jsonPath("$.roomId").value(roomA))
				.andExpect(jsonPath("$.employeeName").value("田中架空"))
				.andExpect(jsonPath("$.startAt").value(at(tomorrow, "10:00:00")))
				.andExpect(jsonPath("$.endAt").value(at(tomorrow, "11:30:00")))
				.andExpect(jsonPath("$.purpose").value("営業定例"));

		mvc.perform(get("/api/reservations").param("date", tomorrow))
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].purpose").value("営業定例"));
	}

	@Test
	void 用件は前後の空白を除き_空なら用件なしになる() throws Exception {
		create(body(tanaka, roomA, at(tomorrow, "09:00:00"), at(tomorrow, "10:00:00"), "  朝会  "))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.purpose").value("朝会"));
		create(body(tanaka, roomB, at(tomorrow, "09:00:00"), at(tomorrow, "10:00:00"), "   "))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.purpose").doesNotExist());
	}

	@Test
	void 見えない文字だけの用件は用件なしになり_改行を含む用件は400() throws Exception {
		create(body(tanaka, roomA, at(tomorrow, "09:00:00"), at(tomorrow, "10:00:00"), "​"))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.purpose").doesNotExist());
		create(body(tanaka, roomB, at(tomorrow, "09:00:00"), at(tomorrow, "10:00:00"), "1行目\\n2行目")) // JSON の \n（改行）として送る
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.message").value("用件に改行やタブは使えません"));
	}

	@Test
	void 読み取れない本文は原因に合わせた文で400になる() throws Exception {
		create(body(tanaka, roomA, "あした", at(tomorrow, "10:00:00"), null))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("日時の形")));
		create("{\"employeeId\": \"abc\", \"roomId\": 1}")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("JSON の形")));
		create("{こわれた")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("JSON の形")));
	}

	@Test
	void 隣り合う予約と別の会議室の同じ時間は作れる() throws Exception {
		create(roomA, tomorrow, "10:00:00", "11:00:00").andExpect(status().isCreated());
		create(roomA, tomorrow, "11:00:00", "12:00:00").andExpect(status().isCreated());
		create(roomA, tomorrow, "09:00:00", "10:00:00").andExpect(status().isCreated());
		create(roomB, tomorrow, "10:00:00", "11:00:00").andExpect(status().isCreated());
		assertThat(count()).isEqualTo(4);
	}

	@Test
	void 同じ会議室で時間が重なると409() throws Exception {
		create(roomA, tomorrow, "10:00:00", "11:00:00").andExpect(status().isCreated());

		for (var overlap : List.of(
				new String[] { "10:00:00", "11:00:00" }, // 同じ
				new String[] { "09:30:00", "10:30:00" }, // 前から食い込む
				new String[] { "10:30:00", "11:30:00" }, // 後ろに食い込む
				new String[] { "09:00:00", "12:00:00" }, // 包む
				new String[] { "10:30:00", "11:00:00" })) { // 中に入る
			create(roomA, tomorrow, overlap[0], overlap[1])
					.andExpect(status().isConflict())
					.andExpect(jsonPath("$.message").value("その時間はすでに予約があります"));
		}
		assertThat(count()).isEqualTo(1);
	}

	@Test
	void 同時に同じ枠を押しても_予約は1件だけ() throws Exception {
		var pool = Executors.newFixedThreadPool(2);
		var go = new CountDownLatch(1);
		try {
			var tasks = List.of(
					pool.submit(() -> {
						go.await();
						return create(roomA, tomorrow, "14:00:00", "15:00:00").andReturn().getResponse().getStatus();
					}),
					pool.submit(() -> {
						go.await();
						return create(roomA, tomorrow, "14:00:00", "15:00:00").andReturn().getResponse().getStatus();
					}));
			go.countDown();
			var statuses = List.of(tasks.get(0).get(), tasks.get(1).get());
			assertThat(statuses).containsExactlyInAnyOrder(201, 409);
		} finally {
			pool.shutdownNow();
		}
		assertThat(count()).isEqualTo(1);
	}

	@Test
	void 時間の決まりに反すると400でメッセージを返し_何も作らない() throws Exception {
		var yesterday = LocalDate.now(TOKYO).minusDays(1).toString();
		var day90 = LocalDate.now(TOKYO).plusDays(90).toString();
		var day91 = LocalDate.now(TOKYO).plusDays(91).toString();

		create(roomA, tomorrow, "10:15:00", "11:00:00").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.message").value("時刻は 30 分刻み（00 分か 30 分）で指定してください"));
		create(roomA, tomorrow, "11:00:00", "11:00:00").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.message").value("終了は開始より後にしてください"));
		create(roomA, tomorrow, "11:00:00", "10:00:00").andExpect(status().isBadRequest());
		create(roomA, tomorrow, "07:30:00", "08:30:00").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.message").value("予約できる時間は 8:00〜20:00 です"));
		create(roomA, tomorrow, "19:30:00", "20:30:00").andExpect(status().isBadRequest());
		create(roomA, tomorrow, "10:00:00", "14:30:00").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.message").value("1 件の予約は 4 時間までです"));
		create(roomA, yesterday, "10:00:00", "11:00:00").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.message").value("過去の時間は予約できません"));
		create(roomA, day91, "10:00:00", "11:00:00").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.message").value("予約できるのは今日から 90 日先までです"));
		create(body(tanaka, roomA, at(tomorrow, "19:00:00"), at(LocalDate.parse(tomorrow).plusDays(1).toString(), "09:00:00"), null))
				.andExpect(status().isBadRequest());
		assertThat(count()).isZero();

		// ちょうど 4 時間・90 日先は作れる
		create(roomA, tomorrow, "10:00:00", "14:00:00").andExpect(status().isCreated());
		create(roomA, day90, "10:00:00", "11:00:00").andExpect(status().isCreated());
	}

	@Test
	void 用件が50文字を超えると400_50文字ちょうどは作れる() throws Exception {
		create(body(tanaka, roomA, at(tomorrow, "10:00:00"), at(tomorrow, "11:00:00"), "あ".repeat(51)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.message").value("用件は 50 文字までです"));
		create(body(tanaka, roomA, at(tomorrow, "10:00:00"), at(tomorrow, "11:00:00"), "あ".repeat(50)))
				.andExpect(status().isCreated());
	}

	@Test
	void 足りない項目や読めない内容は400() throws Exception {
		create("{}").andExpect(status().isBadRequest());
		create("{\"employeeId\": %d, \"roomId\": %d}".formatted(tanaka, roomA)).andExpect(status().isBadRequest());
		create("これはJSONではない").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.message").isString());
		create(body(tanaka, roomA, "明日の10時", "明日の11時", null)).andExpect(status().isBadRequest());
		assertThat(count()).isZero();
	}

	@Test
	void 社員や会議室が無ければ404() throws Exception {
		create(body(999999, roomA, at(tomorrow, "10:00:00"), at(tomorrow, "11:00:00"), null))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.message").value("社員が見つかりません"));
		create(body(tanaka, 999999, at(tomorrow, "10:00:00"), at(tomorrow, "11:00:00"), null))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.message").value("会議室が見つかりません"));
		assertThat(count()).isZero();
	}
}
