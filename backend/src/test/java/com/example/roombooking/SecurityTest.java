package com.example.roombooking;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/** 公開前のセキュリティ確認で見つけた弱点が、直ったままであることを確かめる。 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class SecurityTest {

	@Autowired
	MockMvc mvc;

	@Test
	void 成功も失敗も_守りのヘッダーが付く() throws Exception {
		for (var path : new String[] { "/api/rooms", "/api/nothing" }) {
			mvc.perform(get(path))
					.andExpect(header().string("X-Content-Type-Options", "nosniff"))
					.andExpect(header().string("X-Frame-Options", "DENY"))
					.andExpect(header().string("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'"))
					.andExpect(header().string("Referrer-Policy", "no-referrer"))
					.andExpect(header().string("Cache-Control", "no-store"));
		}
	}

	@Test
	void 大きすぎる本文は読む前に413() throws Exception {
		var big = "{\"purpose\":\"" + "a".repeat(20_000) + "\"}";
		mvc.perform(post("/api/reservations").contentType(MediaType.APPLICATION_JSON).content(big))
				.andExpect(status().isContentTooLarge())
				.andExpect(jsonPath("$.message").value("送られた内容が大きすぎます"));
	}

	@Test
	void 極端な日付は500ではなく400() throws Exception {
		for (var date : new String[] { "+999999999-01-01", "-999999999-01-01", "2201-01-01", "1899-12-31" }) {
			mvc.perform(get("/api/reservations").param("date", date))
					.andExpect(status().isBadRequest())
					.andExpect(jsonPath("$.message").exists());
		}
		mvc.perform(get("/api/reservation-days").param("from", "0001-01-01").param("to", "9999-12-31"))
				.andExpect(status().isBadRequest());
	}

	@Test
	void 外のサイトからの通信を許す印_CORS_は付かない() throws Exception {
		mvc.perform(get("/api/rooms").header("Origin", "https://evil.example"))
				.andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
		mvc.perform(options("/api/reservations/1")
				.header("Origin", "https://evil.example")
				.header("Access-Control-Request-Method", "DELETE"))
				.andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
	}
}
