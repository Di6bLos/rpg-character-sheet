// Seeds the LOCAL Supabase stack with fixed test data, safely re-runnable:
//   - admin@test.local (site admin), gm@test.local, player@test.local; password in utils/devAccounts
//   - Nimble campaign "Test Table" run by the GM, with the player's level 5 Mage "Iriel" seated
// Existing rows are kept (passwords and roles are reset); `--reset` also rebuilds Iriel's sheet.
//
//   npm run dev:seed            # usually via `npm run dev:local`
//   npm run dev:seed -- --reset
//
// Refuses to run against anything but 127.0.0.1 / localhost.
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { classBySlug } from '../data/nimble/classes'
import { DEV_ACCOUNTS, DEV_PASSWORD, isLocalSupabase } from '../utils/devAccounts'
import { build, levelTo } from '../utils/nimbleAutoBuild'

export interface LocalStack {
  url: string
  anonKey: string
  serviceKey: string
}

/** Reads the running local stack's URL and keys from the Supabase CLI. */
export function localStack(): LocalStack | null {
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

const CAMPAIGN = 'Test Table'
const HERO = { name: 'Iriel', classSlug: 'mage', level: 5 }

async function upsertUser(db: SupabaseClient, account: (typeof DEV_ACCOUNTS)[number]) {
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

function buildHero() {
  const cls = classBySlug(HERO.classSlug)
  if (!cls) throw new Error(`Unknown class ${HERO.classSlug}`)
  const sheet = build(cls)
  levelTo(sheet, HERO.level, cls.subclasses[0]?.slug ?? '')
  return sheet
}

export async function seedLocal(stack: LocalStack, opts: { reset?: boolean } = {}) {
  if (!isLocalSupabase(stack.url)) {
    throw new Error(`Refusing to seed ${stack.url}: only the local Supabase stack can be seeded.`)
  }
  const db = createClient(stack.url, stack.serviceKey, { auth: { persistSession: false } })

  const ids: Record<string, string> = {}
  for (const account of DEV_ACCOUNTS) ids[account.key] = await upsertUser(db, account)
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

  // The player's hero.
  const { data: hero } = await db
    .from('characters')
    .select('id')
    .eq('user_id', player)
    .eq('name', HERO.name)
    .maybeSingle()
  let heroId = hero?.id as string | undefined
  if (!heroId) {
    const { data, error } = await db
      .from('characters')
      .insert({
        user_id: player,
        name: HERO.name,
        system: 'nimble',
        level: HERO.level,
        sheet: buildHero(),
      })
      .select('id')
      .single()
    if (error) throw error
    heroId = data.id as string
  } else if (opts.reset) {
    const { error } = await db
      .from('characters')
      .update({ level: HERO.level, sheet: buildHero() })
      .eq('id', heroId)
    if (error) throw error
  }

  // Seat the player with the hero.
  const { error: seatError } = await db
    .from('campaign_members')
    .upsert(
      { campaign_id: campaign.id, user_id: player, role: 'player', character_id: heroId },
      { onConflict: 'campaign_id,user_id' },
    )
  if (seatError) throw seatError

  return { campaignId: campaign.id as string, heroId }
}

// CLI
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const stack = localStack()
  if (!stack) {
    console.error('The local Supabase stack is not running. Start it with `supabase start`.')
    process.exit(1)
  }
  seedLocal(stack, { reset: process.argv.includes('--reset') })
    .then(({ campaignId }) => {
      console.log('Seeded the local stack:')
      for (const a of DEV_ACCOUNTS)
        console.log(`  ${a.label.padEnd(7)} ${a.email} / ${DEV_PASSWORD}`)
      console.log(`  Campaign "${CAMPAIGN}": /campaigns/${campaignId}/board`)
    })
    .catch((err) => {
      console.error('Seeding failed:', err.message ?? err)
      process.exit(1)
    })
}
