# 技術スタック（使うツールとバージョン）

[要件定義書](requirements.md) の「技術スタック」の詳細。
**使うツールを足したり、バージョンを上げたりしたら、この表も更新する。**
確認日: 2026-11-23 に画面側の版を `npm outdated` で再確認（そのほかは 2026-11-18。`npm view`・Maven Central・Gradle 公式で、正式公開された安定版の最新を確認）
方針: 正式公開された安定版の最新を使う（β版・RC・SNAPSHOT は使わない）。状態: **一部作成済み**（DB・backend・画面の骨組みは作成済みで、版は backend/build.gradle と frontend/package.json と同じ。CI は GitHub Actions（`.github/workflows/ci.yml`。Action は SHA で固定））。

## 実行環境
| 項目 | バージョン | 役割 |
|---|---|---|
| Node.js | 24.22.1 | 画面側の開発の道具を動かす（今の PC に入っている版） |
| npm | 11.19.1 | 画面側の部品の管理 |
| Java（Temurin 系 OpenJDK） | 25.0.4.1（LTS） | API を動かす。LTS の最新 |
| Docker | 29.8.1 | PostgreSQL を動かす。API のテストでも使い捨ての PostgreSQL を起動する |

## 画面（React + Vite + TypeScript）
| 名前 | バージョン | 役割 |
|---|---|---|
| React / React DOM | 19.3.1 | 画面を作る部品 |
| Vite | 8.3.8 | 開発用サーバーとビルド |
| @vitejs/plugin-react | 6.3.0 | Vite で React を使う |
| TypeScript | 7.0.2 | 型チェック（`tsc --noEmit` を lint・ビルド・CI に入れる） |
| oxlint | 1.94.0 | コードの書き方チェック（lint） |
| Vitest / @vitest/coverage-v8 | 5.1.1 | 自動テストと網羅率 |
| @playwright/test | 1.65.1 | E2E テスト（ブラウザ Chromium を自動で動かす） |
| pg | 8.23.1 | E2E テストの使い捨て DB を作る・消す（テスト専用） |
| @types/node | 26.6.6 | E2E の設定ファイルの型（テスト専用） |
| jsdom | 31.0.1 | テストの中でブラウザの代わりをする |
| @testing-library/react | 16.3.3 | テストで画面を表示して操作する |
| @testing-library/user-event | 14.6.13 | テストで人の操作を再現する |
| @testing-library/jest-dom | 8.0.0 | テストの確認を書きやすくする |

## API（Spring Boot）
| 名前 | バージョン | 役割 |
|---|---|---|
| Spring Boot | 4.1.2 | API の土台（4.2.0 は RC のため使わない。前のアプリで確認した正式版） |
| Gradle | 9.9.1 | ビルド（Gradle Wrapper で使う） |
| Spring Web MVC / Data JPA / Validation | Spring Boot に合わせる | API の窓口・DB の読み書き・入力チェック |
| Flyway | 12.4.0 | 表の作成・初期データ・排他制約を SQL で履歴管理（前のアプリの版。作成時に再確認） |
| PostgreSQL JDBC ドライバー | 42.7.14 | Java から PostgreSQL につなぐ |
| Testcontainers | 2.0.5 | テスト用の使い捨て PostgreSQL（前のアプリの版。作成時に再確認） |
| JUnit | 6.0.3 | API の自動テスト（Spring Boot に合わせる） |

## DB
| 名前 | バージョン | 役割 |
|---|---|---|
| PostgreSQL | 18（Docker イメージ `postgres:18`） | 予約などを保存する。重複防止の排他制約には `btree_gist` 拡張を使う。DB 名・ユーザー・パスワードは `.env`（見本は `.env.example`） |

## 開発の道具
| 名前 | バージョン | 役割 |
|---|---|---|
| Git | 2.55.0 | 変更の記録 |
| GitHub CLI（gh） | 2.100.0 | Issue・PR の作成 |

## ポート
画面 5173、API 8080、DB 5432（固定。[CLAUDE.md](../CLAUDE.md) 参照）。

## メモ
- 「前のアプリの版」と書いた項目は、2026-11-17 に確認した版を引き継いでいる。実際に導入するときに、最新の正式版かを確認し直す。
- GitHub Actions（2026-11-20 確認。コミットの SHA で固定）: actions/checkout v7.0.1、actions/setup-node v7.1.0、actions/setup-java v6.3.0、gradle/actions（setup-gradle）v6.4.1。版を上げるときは、新しい版の SHA に書き換える。
