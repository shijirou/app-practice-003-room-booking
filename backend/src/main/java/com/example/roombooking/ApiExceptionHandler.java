package com.example.roombooking;

import java.sql.SQLException;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

/** 失敗は {"message": "..."} の同じ形で返す（docs/data-design.md の「失敗したときの返し方」）。 */
@RestControllerAdvice
public class ApiExceptionHandler {

	private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

	@ExceptionHandler(BadRequestException.class)
	ResponseEntity<Map<String, String>> badRequest(BadRequestException e) {
		return body(HttpStatus.BAD_REQUEST, e.getMessage());
	}

	/** 数字のはずの値が数字でないとき（例: employeeId=abc） */
	@ExceptionHandler(MethodArgumentTypeMismatchException.class)
	ResponseEntity<Map<String, String>> typeMismatch(MethodArgumentTypeMismatchException e) {
		return body(HttpStatus.BAD_REQUEST, e.getName() + " の値が正しくありません");
	}

	/** 必ず付ける値（例: from・to）が足りないとき */
	@ExceptionHandler(MissingServletRequestParameterException.class)
	ResponseEntity<Map<String, String>> missingParameter(MissingServletRequestParameterException e) {
		return body(HttpStatus.BAD_REQUEST, e.getParameterName() + " を指定してください");
	}

	@ExceptionHandler(NotFoundException.class)
	ResponseEntity<Map<String, String>> notFound(NotFoundException e) {
		return body(HttpStatus.NOT_FOUND, e.getMessage());
	}

	@ExceptionHandler(ForbiddenException.class)
	ResponseEntity<Map<String, String>> forbidden(ForbiddenException e) {
		return body(HttpStatus.FORBIDDEN, e.getMessage());
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
		return unexpected(e);
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
		return unexpected(e);
	}

	/**
	 * 上のどれにも当てはまらないもの。宛先がない（404）・できない操作（405）・形式が違う（415）など、
	 * Spring が決めた状態コードはそのまま使い、想定外は 500。どれも {"message": "..."} の形にそろえ、内部の詳細は返さない。
	 */
	@ExceptionHandler(Exception.class)
	ResponseEntity<Map<String, String>> others(Exception e) {
		if (e instanceof ErrorResponse errorResponse) {
			var status = HttpStatus.valueOf(errorResponse.getStatusCode().value());
			return body(status, switch (status) {
				case NOT_FOUND -> "見つかりません";
				case METHOD_NOT_ALLOWED -> "この方法では呼べません";
				case UNSUPPORTED_MEDIA_TYPE -> "本文は JSON（application/json）で送ってください";
				default -> "リクエストを処理できません";
			});
		}
		return unexpected(e);
	}

	/** 想定外のエラー。詳しい内容は、サーバーのログにだけ残す（返事には出さない）。 */
	private static ResponseEntity<Map<String, String>> unexpected(Exception e) {
		log.error("想定外のエラー", e);
		return body(HttpStatus.INTERNAL_SERVER_ERROR, "エラーが起きました");
	}

	private static ResponseEntity<Map<String, String>> body(HttpStatus status, String message) {
		return ResponseEntity.status(status).body(Map.of("message", message));
	}
}
