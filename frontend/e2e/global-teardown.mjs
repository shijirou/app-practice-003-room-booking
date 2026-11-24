// テストが終わったら、使い捨て DB を消す
import { dropDb } from './db.mjs'

export default async function globalTeardown() {
  await dropDb()
}
