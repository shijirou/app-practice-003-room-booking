package com.example.roombooking;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

/** 「今」が関わる決まり（過去・90 日先・30 分切り上げ）を、時計を止めて確かめる。DB は使わない。 */
class ReservationRulesTest {

	// 日本時間 2026-11-20 09:10（世界時 00:10）に固定
	private final ReservationRules rules = new ReservationRules(
			Clock.fixed(Instant.parse("2026-11-20T00:10:00Z"), ZoneOffset.UTC));

	private static OffsetDateTime jst(String text) {
		return OffsetDateTime.parse(text + "+09:00");
	}

	@Test
	void 今日の今の時刻は30分単位で切り上げた時刻から予約できる() {
		assertThat(rules.earliestStart().toLocalTime().toString()).isEqualTo("09:30");
		assertThatThrownBy(() -> rules.checkTime(jst("2026-11-20T09:00:00"), jst("2026-11-20T10:00:00")))
				.isInstanceOf(BadRequestException.class).hasMessage("過去の時間は予約できません");
		assertThatCode(() -> rules.checkTime(jst("2026-11-20T09:30:00"), jst("2026-11-20T10:00:00")))
				.doesNotThrowAnyException();
	}

	@Test
	void ちょうど30分の時刻なら_その時刻から予約できる() {
		var onTheDot = new ReservationRules(Clock.fixed(Instant.parse("2026-11-20T00:30:00Z"), ZoneOffset.UTC));
		assertThatCode(() -> onTheDot.checkTime(jst("2026-11-20T09:30:00"), jst("2026-11-20T10:00:00")))
				.doesNotThrowAnyException();
	}

	@Test
	void 今日から90日先までで_91日先は断る() {
		assertThatCode(() -> rules.checkTime(jst("2027-02-18T10:00:00"), jst("2027-02-18T11:00:00")))
				.doesNotThrowAnyException(); // 11/20 + 90 日
		assertThatThrownBy(() -> rules.checkTime(jst("2027-02-19T10:00:00"), jst("2027-02-19T11:00:00")))
				.isInstanceOf(BadRequestException.class);
	}

	@Test
	void 時差が違っても日本時間で判断する() {
		// 世界時 2026-11-20 23:00 = 日本時間 11/21 08:00（開館の時刻）
		var start = OffsetDateTime.parse("2026-11-20T23:00:00Z");
		assertThatCode(() -> rules.checkTime(start, start.plusHours(1))).doesNotThrowAnyException();
		// 世界時 22:30 = 日本時間 07:30（開館前）
		var early = OffsetDateTime.parse("2026-11-20T22:30:00Z");
		assertThatThrownBy(() -> rules.checkTime(early, early.plusHours(1))).isInstanceOf(BadRequestException.class);
	}

	@Test
	void 見えない文字だけの用件は用件なし_前後の見えない文字は除く_途中の改行とタブは断る() {
		// 見えない文字: ゼロ幅スペース U+200B・BOM U+FEFF・ノーブレークスペース U+00A0・改行・タブ
		assertThat(rules.cleanPurpose("​")).isNull();
		assertThat(rules.cleanPurpose("​﻿  \n\t")).isNull();
		assertThat(rules.cleanPurpose("​定例﻿")).isEqualTo("定例");
		assertThat(rules.cleanPurpose("\n定例\n")).isEqualTo("定例"); // 前後の改行は、空白と同じく除く
		// 途中の改行・タブは断る
		assertThatThrownBy(() -> rules.cleanPurpose("1行目\n2行目"))
				.isInstanceOf(BadRequestException.class).hasMessage("用件に改行やタブは使えません");
		assertThatThrownBy(() -> rules.cleanPurpose("a\tb")).isInstanceOf(BadRequestException.class);
		assertThatThrownBy(() -> rules.cleanPurpose("a\r\nb")).isInstanceOf(BadRequestException.class);
		// 文字数は、見えない文字を除いたあとで数える（50 文字ちょうどは通る）
		assertThat(rules.cleanPurpose("​" + "a".repeat(50) + "​")).hasSize(50);
	}

	@Test
	void 用件は空白を除き_空はnull_50文字まで() {
		assertThat(rules.cleanPurpose(null)).isNull();
		assertThat(rules.cleanPurpose("  　 ")).isNull();
		assertThat(rules.cleanPurpose(" 定例 ")).isEqualTo("定例");
		assertThatThrownBy(() -> rules.cleanPurpose("a".repeat(51))).isInstanceOf(BadRequestException.class);
		// 絵文字などは 1 文字として数える（DB の varchar(50) と同じ数え方）
		assertThat(rules.cleanPurpose("😀".repeat(50))).hasSize(100);
	}
}
