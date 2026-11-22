package com.example.roombooking;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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
	void ほかの理由のロック失敗は409にせずそのまま投げる() {
		var e = new CannotAcquireLockException("timeout", new SQLException("lock timeout", "55P03"));

		assertThatThrownBy(() -> handler.lockFailure(e)).isSameAs(e);
	}
}
