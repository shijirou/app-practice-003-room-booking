package com.example.roombooking;

/** 今の状態とぶつかるとき（409）。例: 同じ会議室の同じ時間にすでに予約がある。 */
public class ConflictException extends RuntimeException {

	public ConflictException(String message) {
		super(message);
	}
}
