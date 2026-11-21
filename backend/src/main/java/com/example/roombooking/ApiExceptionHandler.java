package com.example.roombooking;

import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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

	private static ResponseEntity<Map<String, String>> body(HttpStatus status, String message) {
		return ResponseEntity.status(status).body(Map.of("message", message));
	}
}
