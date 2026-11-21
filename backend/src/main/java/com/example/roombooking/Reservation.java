package com.example.roombooking;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import java.time.Instant;

/** 予約（DB の reservation 表）。 */
@Entity
public class Reservation {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "room_id")
	private Room room;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "employee_id")
	private Employee employee;

	@Column(name = "start_at")
	private Instant startAt;

	@Column(name = "end_at")
	private Instant endAt;

	private String purpose;

	protected Reservation() {
	}

	public Reservation(Room room, Employee employee, Instant startAt, Instant endAt, String purpose) {
		this.room = room;
		this.employee = employee;
		this.startAt = startAt;
		this.endAt = endAt;
		this.purpose = purpose;
	}

	public Long getId() {
		return id;
	}
}
