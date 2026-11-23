package com.example.roombooking;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/** どんな失敗でも、返事が {"message": "..."} の形でそろうことを確かめる（docs/data-design.md の「失敗したときの返し方」）。 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class ErrorFormatTest {

	@Autowired
	MockMvc mvc;

	@Test
	void 必須の値が足りないと400() throws Exception {
		mvc.perform(get("/api/reservation-days"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.message").value("from を指定してください"));
	}

	@Test
	void 宛先がないと404_できない操作は405_JSON以外の本文は415() throws Exception {
		mvc.perform(get("/api/nothing"))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.message").value("見つかりません"));
		mvc.perform(patch("/api/reservations/1"))
				.andExpect(status().isMethodNotAllowed())
				.andExpect(jsonPath("$.message").value("この方法では呼べません"));
		mvc.perform(post("/api/reservations").contentType(MediaType.TEXT_PLAIN).content("x"))
				.andExpect(status().isUnsupportedMediaType())
				.andExpect(jsonPath("$.message").value("本文は JSON（application/json）で送ってください"));
	}
}
