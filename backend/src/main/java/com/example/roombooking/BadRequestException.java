package com.example.roombooking;

/** 入力が正しくないとき（400）。メッセージはそのまま画面に出せる 1 文にする。 */
public class BadRequestException extends RuntimeException {

	public BadRequestException(String message) {
		super(message);
	}
}
