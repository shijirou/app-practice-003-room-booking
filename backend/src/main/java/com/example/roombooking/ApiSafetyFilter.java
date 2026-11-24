package com.example.roombooking;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * すべての返事に、ブラウザの守りのヘッダーを付ける。あわせて、大きすぎる本文は読む前に断る。
 * <ul>
 * <li>X-Content-Type-Options: nosniff … 返事の種類をブラウザが勝手に推測して、別のもの（スクリプト）として扱うのを防ぐ</li>
 * <li>X-Frame-Options: DENY ・ frame-ancestors 'none' … 他のサイトの枠（iframe）に埋め込まれて、クリックを盗まれる（クリックジャッキング）のを防ぐ</li>
 * <li>Content-Security-Policy: default-src 'none' … API の返事は JSON だけなので、読み込みや実行を一切許さない</li>
 * <li>Referrer-Policy: no-referrer ・ Cache-Control: no-store … 参照元の漏れと、予約の内容がブラウザや途中の機器に残るのを防ぐ</li>
 * </ul>
 */
@Component
public class ApiSafetyFilter extends OncePerRequestFilter {

	/** 予約の本文は 300 バイト前後。余裕を見て 10 KB まで。 */
	static final long MAX_BODY_BYTES = 10_000;

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		response.setHeader("X-Content-Type-Options", "nosniff");
		response.setHeader("X-Frame-Options", "DENY");
		response.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
		response.setHeader("Referrer-Policy", "no-referrer");
		response.setHeader("Cache-Control", "no-store");

		if (request.getContentLengthLong() > MAX_BODY_BYTES) {
			response.setStatus(413);
			response.setContentType("application/json;charset=UTF-8");
			response.getOutputStream().write("{\"message\":\"送られた内容が大きすぎます\"}".getBytes(StandardCharsets.UTF_8));
			return;
		}
		chain.doFilter(request, response);
	}
}
