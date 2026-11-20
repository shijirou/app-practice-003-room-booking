package com.example.roombooking;

import java.sql.SQLException;
import org.springframework.boot.diagnostics.AbstractFailureAnalyzer;
import org.springframework.boot.diagnostics.FailureAnalysis;

/**
 * 起動時に「DB のユーザー名かパスワードが違う」で失敗したとき、長いエラーの代わりに、
 * 原因と直し方を分かりやすく表示する（.env が無い・値が違う、が主な原因のため）。
 */
class DbAuthFailureAnalyzer extends AbstractFailureAnalyzer<SQLException> {

    // PostgreSQL のエラーコード: 28P01 = パスワードが違う、28000 = 認証できない
    private static final String INVALID_PASSWORD = "28P01";
    private static final String INVALID_AUTHORIZATION = "28000";

    @Override
    protected FailureAnalysis analyze(Throwable rootFailure, SQLException cause) {
        String state = cause.getSQLState();
        if (!INVALID_PASSWORD.equals(state) && !INVALID_AUTHORIZATION.equals(state)) {
            return null;
        }
        return new FailureAnalysis(
                "DB にログインできませんでした（ユーザー名かパスワードが違います）。",
                "リポジトリ直下の .env に DB_USER と DB_PASSWORD を書いてください（.env.example が見本）。"
                        + "DB（docker compose）を作ったときと同じ値にします。",
                cause);
    }
}
