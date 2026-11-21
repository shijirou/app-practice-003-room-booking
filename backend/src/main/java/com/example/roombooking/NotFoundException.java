package com.example.roombooking;

/** 社員・会議室・予約が見つからないとき（404）。メッセージはそのまま画面に出せる 1 文にする。 */
public class NotFoundException extends RuntimeException {

	public NotFoundException(String message) {
		super(message);
	}
}
