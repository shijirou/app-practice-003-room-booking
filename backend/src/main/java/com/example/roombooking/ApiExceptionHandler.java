package com.example.roombooking;

import java.sql.SQLException;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

/** 失敗は {"message": "..."} の同じ形で返す（docs/data-design.md の「失敗したときの返し方」）。 */
@RestControllerAdvice
public class ApiExceptionHandler {

	@ExceptionHandler(BadRequestException.class)
	ResponseEntity<Map<String, String>> badRequest(BadRequestException e) {
		return body(HttpStatus.BAD_REQUEST, e.getMessage());
	}

	/** 数字のはずの値が数字でないとき（例: employeeId=abc） */
	@ExceptionHandler(MethodArgumentTypeMismatchException.class)
	ResponseEntity<Map<String, String>> typeMismatch(MethodArgumentTypeMismatchException e) {
		return body(HttpStatus.BAD_REQUEST, e.getName() + " の値が正しくありません");
	}

	@ExceptionHandler(NotFoundException.class)
	ResponseEntity<Map<String, String>> notFound(NotFoundException e) {
		return body(HttpStatus.NOT_FOUND, e.getMessage());
	}

	@ExceptionHandler(ConflictException.class)
	ResponseEntity<Map<String, String>> conflict(ConflictException e) {
		return body(HttpStatus.CONFLICT, e.getMessage());
	}

	/** 本文が JSON として読めない、日時や数字の形が違うなど。原因に合わせて文を分ける */
	@ExceptionHandler(HttpMessageNotReadableException.class)
	ResponseEntity<Map<String, String>> unreadable(HttpMessageNotReadableException e) {
		for (Throwable t = e; t != null; t = t.getCause()) {
			if (t.getMessage() != null && t.getMessage().contains("java.time")) {
				return body(HttpStatus.BAD_REQUEST, "日時の形が正しくありません。2026-11-20T10:00:00+09:00 の形で指定してください");
			}
		}
		return body(HttpStatus.BAD_REQUEST, "送られた内容を読み取れません。JSON の形と、各項目の型（数字か文字か）を確かめてください");
	}

	/**
	 * DB の拒否。排他制約違反（23P01 = 同じ会議室の時間が重なる）だけ 409 にする。
	 * Java の確認をすり抜けて、同時に 2 人が押したときに起こる。ほかは想定外なので、そのまま 500 にする。
	 */
	@ExceptionHandler(DataIntegrityViolationException.class)
	ResponseEntity<Map<String, String>> dataIntegrity(DataIntegrityViolationException e) {
		for (Throwable t = e; t != null; t = t.getCause()) {
			if (t instanceof SQLException sql && "23P01".equals(sql.getSQLState())) {
				return body(HttpStatus.CONFLICT, ReservationService.OVERLAP_MESSAGE);
			}
		}
		throw e;
	}

	/**
	 * 同じ枠を同時に 2 人が押すと、DB が「お互いを待っている（デッドロック。40P01）」と見て片方を止めることがある。
	 * 止められた側は、もう片方に枠を取られたのと同じなので、重複と同じ 409 にする。ほかの理由のロック失敗は 500 のまま。
	 */
	@ExceptionHandler(CannotAcquireLockException.class)
	ResponseEntity<Map<String, String>> lockFailure(CannotAcquireLockException e) {
		for (Throwable t = e; t != null; t = t.getCause()) {
			if (t instanceof SQLException sql && "40P01".equals(sql.getSQLState())) {
				return body(HttpStatus.CONFLICT, ReservationService.OVERLAP_MESSAGE);
			}
		}
		throw e;
	}

	private static ResponseEntity<Map<String, String>> body(HttpStatus status, String message) {
		return ResponseEntity.status(status).body(Map.of("message", message));
	}
}
