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

	/** 同じ会議室で、[start, end) と重なる予約があるか（隣り合う 10-11 と 11-12 は重ならない）。 */
	@Query("""
			select count(r) > 0 from Reservation r
			where r.room.id = :roomId and r.startAt < :end and r.endAt > :start
			""")
	boolean existsOverlap(@Param("roomId") Long roomId, @Param("start") Instant start, @Param("end") Instant end);

	/** existsOverlap と同じだが、変更する予約自身（excludeId）は除く。時間をずらしても自分とは重ならない。 */
	@Query("""
			select count(r) > 0 from Reservation r
			where r.room.id = :roomId and r.startAt < :end and r.endAt > :start and r.id <> :excludeId
			""")
	boolean existsOverlapExcluding(@Param("roomId") Long roomId, @Param("start") Instant start,
			@Param("end") Instant end, @Param("excludeId") Long excludeId);

	/** その社員の、まだ終わっていない予約（進行中を含む）を、開始の早い順に返す。 */
	@Query("""
			select new com.example.roombooking.ReservationResponse(
			    r.id, r.room.id, e.id, e.name, r.startAt, r.endAt, r.purpose)
			from Reservation r join r.employee e
			where e.id = :employeeId and r.endAt > :now
			order by r.startAt, r.id
			""")
	List<ReservationResponse> findNotFinishedByEmployee(@Param("employeeId") Long employeeId, @Param("now") Instant now);
}
