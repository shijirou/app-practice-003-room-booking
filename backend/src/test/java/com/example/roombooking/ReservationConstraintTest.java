package com.example.roombooking;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.SQLException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

/** DB の約束（重複の排他制約・CHECK）が、設計どおりに効いているかを、本物の PostgreSQL で確かめる。 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
class ReservationConstraintTest {

	@Autowired
	JdbcTemplate jdbc;

	long roomA;
	long roomB;
	long employee;

	@BeforeEach
	void setUp() {
		jdbc.update("DELETE FROM reservation");
		roomA = jdbc.queryForObject("SELECT id FROM room WHERE name = '会議室A'", Long.class);
		roomB = jdbc.queryForObject("SELECT id FROM room WHERE name = '会議室B'", Long.class);
		employee = jdbc.queryForObject("SELECT id FROM employee WHERE name = '田中架空'", Long.class);
	}

	private void insert(long room, String start, String end, String purpose) {
		jdbc.update("INSERT INTO reservation (room_id, employee_id, start_at, end_at, purpose) VALUES (?, ?, ?::timestamptz, ?::timestamptz, ?)",
				room, employee, start, end, purpose);
	}

	private String sqlState(Throwable t) {
		Throwable c = t;
		while (c != null && !(c instanceof SQLException)) c = c.getCause();
		return c == null ? null : ((SQLException) c).getSQLState();
	}

	@Test
	void 初期データが入っている() {
		assertThat(jdbc.queryForObject("SELECT count(*) FROM employee", Integer.class)).isEqualTo(6);
		assertThat(jdbc.queryForObject("SELECT count(*) FROM room", Integer.class)).isEqualTo(4);
	}

	@Test
	void 同じ会議室で時間が重なる予約は拒否される_排他制約() {
		insert(roomA, "2026-12-01T10:00:00+09:00", "2026-12-01T11:00:00+09:00", "営業定例");
		assertThatThrownBy(() -> insert(roomA, "2026-12-01T10:30:00+09:00", "2026-12-01T11:30:00+09:00", null))
				.isInstanceOf(DataIntegrityViolationException.class)
				.satisfies(e -> assertThat(sqlState(e)).isEqualTo("23P01"));
	}

	@Test
	void 隣り合う予約は入る() {
		insert(roomA, "2026-12-01T10:00:00+09:00", "2026-12-01T11:00:00+09:00", null);
		insert(roomA, "2026-12-01T11:00:00+09:00", "2026-12-01T12:00:00+09:00", null);
		assertThat(jdbc.queryForObject("SELECT count(*) FROM reservation", Integer.class)).isEqualTo(2);
	}

	@Test
	void 別の会議室なら同じ時間でも入る() {
		insert(roomA, "2026-12-01T10:00:00+09:00", "2026-12-01T11:00:00+09:00", null);
		insert(roomB, "2026-12-01T10:00:00+09:00", "2026-12-01T11:00:00+09:00", null);
	}

	@Test
	void 開始が終了以降の予約は拒否される() {
		assertThatThrownBy(() -> insert(roomA, "2026-12-01T11:00:00+09:00", "2026-12-01T11:00:00+09:00", null))
				.satisfies(e -> assertThat(sqlState(e)).isEqualTo("23514"));
	}

	@Test
	void 三十分刻みでない予約は拒否される() {
		assertThatThrownBy(() -> insert(roomA, "2026-12-01T10:15:00+09:00", "2026-12-01T11:00:00+09:00", null))
				.satisfies(e -> assertThat(sqlState(e)).isEqualTo("23514"));
	}

	@Test
	void 用件が五十文字を超えると拒否される() {
		// 22001 = 文字列が長すぎる（varchar(50)）
		assertThatThrownBy(() -> insert(roomA, "2026-12-01T10:00:00+09:00", "2026-12-01T11:00:00+09:00", "あ".repeat(51)))
				.satisfies(e -> assertThat(sqlState(e)).isEqualTo("22001"));
	}

	@Test
	void 用件が空文字だと拒否される_なしはNULLで統一() {
		assertThatThrownBy(() -> insert(roomA, "2026-12-01T10:00:00+09:00", "2026-12-01T11:00:00+09:00", ""))
				.satisfies(e -> assertThat(sqlState(e)).isEqualTo("23514"));
	}

	@Test
	void 予約のある会議室は削除できない() {
		// 23001 = ON DELETE RESTRICT による拒否
		insert(roomA, "2026-12-01T10:00:00+09:00", "2026-12-01T11:00:00+09:00", null);
		assertThatThrownBy(() -> jdbc.update("DELETE FROM room WHERE id = ?", roomA))
				.satisfies(e -> assertThat(sqlState(e)).isEqualTo("23001"));
	}
}
