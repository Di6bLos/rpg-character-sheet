// Test accounts in the LOCAL Supabase stack, created by `npm run dev:seed`
// (also run by `npm run dev:local`). They never exist on the hosted project.
// The sign-in page offers one-click buttons for them in dev against the local stack.

export const DEV_PASSWORD = 'testpass123'

export interface DevAccount {
  key: 'admin' | 'gm' | 'player'
  label: string
  email: string
  displayName: string
  role: 'admin' | 'member'
}

export const DEV_ACCOUNTS: DevAccount[] = [
  { key: 'admin', label: 'Admin', email: 'admin@test.local', displayName: 'Admin', role: 'admin' },
  { key: 'gm', label: 'GM', email: 'gm@test.local', displayName: 'gm', role: 'member' },
  {
    key: 'player',
    label: 'Player',
    email: 'player@test.local',
    displayName: 'player',
    role: 'member',
  },
]

/** Extra players seated at "Test Table" with level 5 heroes (sign in with the form). */
export interface DevPartyMember {
  email: string
  displayName: string
  handle: string
  hero: { name: string; classSlug: string }
}

export const DEV_PARTY: DevPartyMember[] = [
  {
    email: 'bram@test.local',
    displayName: 'bram',
    handle: 'bram',
    hero: { name: 'Bram', classSlug: 'berserker' },
  },
  {
    email: 'wren@test.local',
    displayName: 'wren',
    handle: 'wren',
    hero: { name: 'Wren', classSlug: 'hunter' },
  },
  {
    email: 'thorne@test.local',
    displayName: 'thorne',
    handle: 'thorne',
    hero: { name: 'Thorne', classSlug: 'oathsworn' },
  },
  {
    email: 'sable@test.local',
    displayName: 'sable',
    handle: 'sable',
    hero: { name: 'Sable', classSlug: 'shadowmancer' },
  },
  {
    email: 'lark@test.local',
    displayName: 'lark',
    handle: 'lark',
    hero: { name: 'Lark', classSlug: 'songweaver' },
  },
]

/** The dev server talks to the local Supabase stack, not the hosted project. */
export function isLocalSupabase(url: string): boolean {
  try {
    return ['127.0.0.1', 'localhost'].includes(new URL(url).hostname)
  } catch {
    return false
  }
}
