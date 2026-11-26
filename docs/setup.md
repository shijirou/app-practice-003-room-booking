# 起動方法とテスト
必要なもの: Java 25・Node.js 24・Docker。

DB → API → 画面の順に 3 つ起動し、ブラウザで http://localhost:5173 を開きます（ポートは 5432・8080・5173 で固定）。

## 1. DB（PostgreSQL・ポート 5432）
1. `.env.example` をコピーして `.env` を作り、`DB_PASSWORD` を自分で決めた値に書き換える（`.env` は GitHub に載せない）。
2. `docker compose up -d` で起動する（停止は `docker compose down`）。

## 2. API（Spring Boot・ポート 8080）
`backend/` で `./gradlew bootRun`。起動すると、Flyway が表とサンプルデータ（すべて架空）を作ります。

## 3. 画面（React + Vite・ポート 5173）
`frontend/` で、初回だけ `npm ci`、そのあと `npm run dev`。

## テストと検査
| 場所 | コマンド | 内容 |
|---|---|---|
| `backend/` | `./gradlew test` | API のテスト（Docker が必要） |
| `backend/` | `./gradlew check` | テスト + SpotBugs（静的解析）+ javac の警告（Docker が必要。CI と同じ） |
| `frontend/` | `npm run lint` | 書き方チェックと型チェック |
| `frontend/` | `npm test` | 画面のテスト（`npm run coverage` で網羅率） |
| `frontend/` | `npm run build` | 型チェックのあとにビルド |
| `frontend/` | `npm run e2e` | E2E テスト（下の説明を参照） |

E2E テストは、ブラウザを自動で動かして、予約・変更・キャンセルなどを通しで確かめます。先に `docker compose up -d` で DB だけを起動し、**開発用の API・画面は止めておきます**（テストが 8080・5173 で自動起動します）。使い捨ての DB `room_booking_e2e` を作り、終わると消します（開発用の DB は触りません）。初回だけ `npx playwright install chromium` が必要です。

版の一覧は [技術スタック](tech-stack.md)。
