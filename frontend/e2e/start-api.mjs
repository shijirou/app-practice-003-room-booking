// E2E 用に API（8080）を起動する。先に使い捨て DB を作り、API をその DB につなぐ。
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createDb, E2E_DB } from './db.mjs'

await createDb()

const backend = fileURLToPath(new URL('../../backend/', import.meta.url))
// Windows では cmd 経由で gradlew.bat、それ以外は ./gradlew
const [command, args] =
  process.platform === 'win32' ? ['cmd.exe', ['/c', '.\\gradlew.bat', 'bootRun']] : ['./gradlew', ['bootRun']]
const api = spawn(command, args, {
  cwd: backend,
  env: { ...process.env, DB_NAME: E2E_DB },
  stdio: 'inherit',
})
api.on('exit', (code) => process.exit(code ?? 1))
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => api.kill(signal))
