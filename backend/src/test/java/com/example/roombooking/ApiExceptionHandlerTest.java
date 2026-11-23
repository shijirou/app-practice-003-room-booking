package com.example.roombooking;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.SQLException;
import org.junit.jupiter.api.Test;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.http.HttpStatus;

/** DB の失敗を、画面に返す形（409 など）に直す部分を、DB なしで確かめる。 */
class ApiExceptionHandlerTest {

	private final ApiExceptionHandler handler = new ApiExceptionHandler();

	@Test
	void デッドロック40P01は重複と同じ409にする() {
		var e = new CannotAcquireLockException("deadlock", new SQLException("deadlock detected", "40P01"));

		var response = handler.lockFailure(e);

		assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
		assertThat(response.getBody()).containsEntry("message", "その時間はすでに予約があります");
	}

	@Test
	void ほかの理由のロック失敗は409にせず_内部の詳細を出さない500にする() {
		var e = new CannotAcquireLockException("timeout", new SQLException("lock timeout", "55P03"));

		var response = handler.lockFailure(e);

		assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
		assertThat(response.getBody()).containsEntry("message", "エラーが起きました");
	}

	@Test
	void 想定外の例外は500で_message形式にする() {
		var response = handler.others(new IllegalStateException("内部の事情"));

		assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
		assertThat(response.getBody()).containsEntry("message", "エラーが起きました");
		assertThat(response.getBody().toString()).doesNotContain("内部の事情");
	}
}
