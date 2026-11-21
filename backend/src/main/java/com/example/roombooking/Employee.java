package com.example.roombooking;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;

/** 社員（DB の employee 表）。最初から入っていて、画面からは増減しない。 */
@Entity
public class Employee {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private String name;

	protected Employee() {
	}

	public Long getId() {
		return id;
	}

	public String getName() {
		return name;
	}
}
