// One command for local testing against the LOCAL Supabase stack:
// starts the stack if needed, seeds the test accounts, and runs the dev server
// on a fixed port, http://localhost:3100. If that port is taken it stops and says
// by what, instead of drifting to another port. `npm run dev` still uses .env.local.
//
//   npm run dev:local
//   DEV_LOCAL_PORT=3200 npm run dev:local   # another fixed port
import { execFileSync, spawn } from 'node:child_process'
import { connect } from 'node:net'
import { DEV_ACCOUNTS, DEV_PASSWORD } from '../utils/devAccounts'
import { localStack, seedLocal } from './dev-seed'

/** Fixed so the URL never changes; DEV_LOCAL_PORT overrides it if 3100 is needed elsewhere. */
const PORT = Number(process.env.DEV_LOCAL_PORT) || 3100

/** Something accepts connections on host:port. */
function listening(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port })
    socket.setTimeout(500)
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.once('error', () => resolve(false))
  })
}

// A dev server may hold only one loopback (Nuxt binds ::1), and binding a
// wildcard still succeeds then; so try to connect to both instead.
async function portFree(port: number): Promise<boolean> {
  const taken = await Promise.all([listening('127.0.0.1', port), listening('::1', port)])
  return !taken.some(Boolean)
}

function holder(port: number): string {
  try {
    return execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' })
      .split('\n')
      .slice(1)
      .filter(Boolean)
      .map((l) => {
        const [cmd, pid] = l.split(/\s+/)
        const args = execFileSync('ps', ['-o', 'command=', '-p', pid!], { encoding: 'utf8' }).trim()
        return `  pid ${pid} (${cmd}): ${args}`
      })
      .join('\n')
  } catch {
    return '  (could not tell which process)'
  }
}

async function main() {
  if (!(await portFree(PORT))) {
    console.error(`Port ${PORT} is already in use:\n${holder(PORT)}`)
    console.error(`If that's an old dev server, stop it (kill <pid>) and run this again.`)
    process.exit(1)
  }

  let stack = await localStack()
  if (!stack) {
    console.log('Starting the local Supabase stack…')
    execFileSync('supabase', ['start'], { stdio: 'inherit' })
    stack = await localStack()
    if (!stack) throw new Error('The local Supabase stack did not start.')
  }

  const { campaignId } = await seedLocal(stack)
  console.log(
    `\nLocal test accounts (password ${DEV_PASSWORD}), also one-click on the sign-in page:`,
  )
  for (const a of DEV_ACCOUNTS) console.log(`  ${a.label.padEnd(7)} ${a.email}`)
  console.log(`Test campaign: http://localhost:${PORT}/campaigns/${campaignId}/board\n`)

  // Process env wins over .env.local, so this server talks to the local stack.
  const child = spawn('npx', ['nuxt', 'dev', '--port', String(PORT)], {
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_SUPABASE_URL: stack.url,
      VITE_SUPABASE_ANON_KEY: stack.anonKey,
    },
  })
  const stop = () => child.kill('SIGINT')
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  child.on('exit', (code) => process.exit(code ?? 0))
}

main().catch((err) => {
  console.error(err.message ?? err)
  process.exit(1)
})
