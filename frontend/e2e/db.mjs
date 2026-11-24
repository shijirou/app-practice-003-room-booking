// E2E テスト専用の使い捨て DB（room_booking_e2e）を作る・消す。
// 開発用の DB（room_booking）には触らない。同じ PostgreSQL（5432）の中に、別の名前の DB を作る。
import pg from 'pg'

export const E2E_DB = 'room_booking_e2e'

// 手元では、リポジトリ直下の .env から接続情報を読む（CI では環境変数で渡す）
try {
  process.loadEnvFile(new URL('../../.env', import.meta.url))
} catch {
  // .env が無いときは、環境変数だけを使う
}

async function withAdmin(run) {
  if (!process.env.DB_PASSWORD) throw new Error('DB_PASSWORD がありません（.env か環境変数で渡してください）')
  const client = new pg.Client({
    host: '127.0.0.1',
    port: 5432,
    user: process.env.DB_USER ?? 'room_booking',
    password: process.env.DB_PASSWORD,
    database: 'postgres',
  })
  await client.connect()
  try {
    await run(client)
  } finally {
    await client.end()
  }
}

/** 空の使い捨て DB を作る（前回の残りがあれば消してから）。表と架空のデータは、API の起動時に Flyway が作る */
export const createDb = () =>
  withAdmin(async (c) => {
    await c.query(`DROP DATABASE IF EXISTS ${E2E_DB} WITH (FORCE)`)
    await c.query(`CREATE DATABASE ${E2E_DB}`)
  })

/** 使い捨て DB を消す（API がつないだままでも消す） */
export const dropDb = () => withAdmin((c) => c.query(`DROP DATABASE IF EXISTS ${E2E_DB} WITH (FORCE)`))
