package com.example.roombooking;

import java.time.Instant;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ReservationRepository extends JpaRepository<Reservation, Long> {

	/** 開始が [from, to) に入る予約を、開始の早い順に返す（社員名つき）。 */
	@Query("""
			select new com.example.roombooking.ReservationResponse(
			    r.id, r.room.id, e.id, e.name, r.startAt, r.endAt, r.purpose)
			from Reservation r join r.employee e
			where r.startAt >= :from and r.startAt < :to
			order by r.startAt, r.id
			""")
	List<ReservationResponse> findStartingBetween(@Param("from") Instant from, @Param("to") Instant to);
}
