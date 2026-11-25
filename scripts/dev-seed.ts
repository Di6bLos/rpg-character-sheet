// Seeds the LOCAL Supabase stack with fixed test data, safely re-runnable:
//   - admin@test.local (site admin), gm@test.local, player@test.local; password in utils/devAccounts
//   - Nimble campaign "Test Table" run by the GM, with the player's level 5 Mage "Iriel" seated
//   - five more players (DEV_PARTY in utils/devAccounts) seated there with level 5 heroes
// Existing rows are kept (passwords and roles are reset); `--reset` also rebuilds the heroes' sheets.
//
//   npm run dev:seed            # usually via `npm run dev:local`
//   npm run dev:seed -- --reset
//
// Refuses to run against anything but 127.0.0.1 / localhost.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { classBySlug } from '../data/nimble/classes'
import { DEV_ACCOUNTS, DEV_PARTY, DEV_PASSWORD, isLocalSupabase } from '../utils/devAccounts'
import { build, levelTo } from '../utils/nimbleAutoBuild'

export interface LocalStack {
  url: string
  anonKey: string
  serviceKey: string
}

/** Reads the running local stack's URL and keys from the Supabase CLI. */
function readStatus(): LocalStack | null {
  try {
    const raw = execFileSync('supabase', ['status', '-o', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    // Older CLIs print notices before the JSON.
    const status = JSON.parse(raw.slice(raw.indexOf('{'))) as Record<string, string>
    if (!status.API_URL || !status.ANON_KEY || !status.SERVICE_ROLE_KEY) return null
    return { url: status.API_URL, anonKey: status.ANON_KEY, serviceKey: status.SERVICE_ROLE_KEY }
  } catch {
    return null
  }
}

/** The local database container is up (it may still be starting or restarting). */
function dbContainerRunning(): boolean {
  try {
    const config = readFileSync(join(import.meta.dirname, '..', 'supabase', 'config.toml'), 'utf8')
    const project = /^project_id\s*=\s*"([^"]+)"/m.exec(config)?.[1]
    if (!project) return false
    const state = execFileSync(
      'docker',
      ['inspect', '-f', '{{.State.Running}}', `supabase_db_${project}`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
    return state.trim() === 'true'
  } catch {
    return false
  }
}

/**
 * The local stack's URL and keys, or null when it isn't running. While the
 * database container is up but restarting, `supabase status` fails for ~10 s,
 * so it's asked again for up to 30 s; a stopped stack returns null at once.
 */
export async function localStack(): Promise<LocalStack | null> {
  const deadline = Date.now() + 30_000
  for (;;) {
    const stack = readStatus()
    if (stack) return stack
    if (!dbContainerRunning() || Date.now() > deadline) return null
    console.log('The local database is starting up; waiting…')
    await new Promise((r) => setTimeout(r, 2000))
  }
}

const CAMPAIGN = 'Test Table'
export const HERO = { name: 'Iriel', classSlug: 'mage', level: 5 }

/**
 * Runs `step` again (up to 5 tries, 2 s apart) while the local database is
 * unreachable. After a Postgres restart, auth's first query on a dead pooled
 * connection fails ("Database error finding users") before it reconnects.
 */
async function retrying<T>(what: string, step: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await step()
    } catch (err) {
      const message = (err as { message?: string }).message ?? String(err)
      const transient = /database error|fetch failed|ECONNREFUSED|ECONNRESET|EOF|recovery mode/i
      if (attempt >= 5 || !transient.test(message)) {
        throw new Error(
          transient.test(message)
            ? `${what}: the local database isn't answering (${message}). Check \`supabase status\`, or restart it with \`supabase stop && supabase start\`.`
            : `${what}: ${message}`,
        )
      }
      console.log(`${what}: the local database isn't ready (${message}); retrying…`)
      await new Promise((r) => setTimeout(r, 2000))
    }
  }
}

interface SeedAccount {
  email: string
  displayName: string
  key: string
  role: 'admin' | 'member'
}

async function upsertUser(db: SupabaseClient, account: SeedAccount) {
  const { data: list, error: listError } = await db.auth.admin.listUsers({ perPage: 1000 })
  if (listError) throw listError
  const existing = list.users.find((u) => u.email === account.email)
  let id: string
  if (existing) {
    const { error } = await db.auth.admin.updateUserById(existing.id, {
      password: DEV_PASSWORD,
      email_confirm: true,
    })
    if (error) throw error
    id = existing.id
  } else {
    const { data, error } = await db.auth.admin.createUser({
      email: account.email,
      password: DEV_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: account.displayName, handle: account.key },
    })
    if (error) throw error
    id = data.user.id
  }
  // The new-user trigger makes the profile; the role is set here directly (service role).
  const { error } = await db.from('profiles').update({ role: account.role }).eq('id', id)
  if (error) throw error
  return id
}

export function buildHero(hero: { classSlug: string; level: number }) {
  const cls = classBySlug(hero.classSlug)
  if (!cls) throw new Error(`Unknown class ${hero.classSlug}`)
  const sheet = build(cls)
  levelTo(sheet, hero.level, cls.subclasses[0]?.slug ?? '')
  return sheet
}

/** Creates (or with `reset` rebuilds) a user's hero and seats them with it. */
async function seatHero(
  db: SupabaseClient,
  campaignId: string,
  userId: string,
  hero: { name: string; classSlug: string; level: number },
  reset: boolean,
) {
  const { data: found } = await db
    .from('characters')
    .select('id')
    .eq('user_id', userId)
    .eq('name', hero.name)
    .maybeSingle()
  let heroId = found?.id as string | undefined
  if (!heroId) {
    const { data, error } = await db
      .from('characters')
      .insert({
        user_id: userId,
        name: hero.name,
        system: 'nimble',
        level: hero.level,
        sheet: buildHero(hero),
      })
      .select('id')
      .single()
    if (error) throw error
    heroId = data.id as string
  } else if (reset) {
    const { error } = await db
      .from('characters')
      .update({ level: hero.level, sheet: buildHero(hero) })
      .eq('id', heroId)
    if (error) throw error
  }
  const { error: seatError } = await db
    .from('campaign_members')
    .upsert(
      { campaign_id: campaignId, user_id: userId, role: 'player', character_id: heroId },
      { onConflict: 'campaign_id,user_id' },
    )
  if (seatError) throw seatError
  return heroId
}

export async function seedLocal(stack: LocalStack, opts: { reset?: boolean } = {}) {
  if (!isLocalSupabase(stack.url)) {
    throw new Error(`Refusing to seed ${stack.url}: only the local Supabase stack can be seeded.`)
  }
  const db = createClient(stack.url, stack.serviceKey, { auth: { persistSession: false } })

  const ids: Record<string, string> = {}
  for (const account of DEV_ACCOUNTS) {
    ids[account.key] = await retrying(`Account ${account.email}`, () => upsertUser(db, account))
  }
  const gm = ids.gm!
  const player = ids.player!

  // Campaign: the insert trigger seats its creator as GM.
  let { data: campaign } = await db
    .from('campaigns')
    .select('id')
    .eq('name', CAMPAIGN)
    .eq('created_by', gm)
    .maybeSingle()
  if (!campaign) {
    const { data, error } = await db
      .from('campaigns')
      .insert({ name: CAMPAIGN, system: 'nimble', created_by: gm })
      .select('id')
      .single()
    if (error) throw error
    campaign = data
  }

  // The player's hero, then the rest of the party.
  const reset = !!opts.reset
  const heroId = await seatHero(db, campaign.id, player, HERO, reset)
  for (const member of DEV_PARTY) {
    const userId = await retrying(`Account ${member.email}`, () =>
      upsertUser(db, { ...member, key: member.handle, role: 'member' }),
    )
    await seatHero(db, campaign.id, userId, { ...member.hero, level: HERO.level }, reset)
  }

  return { campaignId: campaign.id as string, heroId }
}

// CLI
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  localStack()
    .then((stack) => {
      if (!stack) {
        console.error('The local Supabase stack is not running. Start it with `supabase start`.')
        process.exit(1)
      }
      return seedLocal(stack, { reset: process.argv.includes('--reset') })
    })
    .then(({ campaignId }) => {
      console.log('Seeded the local stack:')
      for (const a of DEV_ACCOUNTS)
        console.log(`  ${a.label.padEnd(7)} ${a.email} / ${DEV_PASSWORD}`)
      for (const m of DEV_PARTY)
        console.log(`  ${m.hero.name.padEnd(7)} ${m.email} / ${DEV_PASSWORD}`)
      console.log(`  Campaign "${CAMPAIGN}": /campaigns/${campaignId}/board`)
    })
    .catch((err) => {
      console.error('Seeding failed:', err.message ?? err)
      process.exit(1)
    })
}
