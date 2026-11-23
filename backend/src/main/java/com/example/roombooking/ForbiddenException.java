package com.example.roombooking;

/** 他の人の予約を変更・キャンセルしようとしたとき（403）。メッセージはそのまま画面に出せる 1 文にする。 */
public class ForbiddenException extends RuntimeException {

	public ForbiddenException(String message) {
		super(message);
	}
}
