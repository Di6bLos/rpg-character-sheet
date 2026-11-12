import type { Message } from '~/types'

/** 'party', or the other member's user id for a private thread. */
export type ThreadId = string

/**
 * Which threads a message belongs to, from the viewer's side: party messages
 * go to 'party'; a private message I received goes to its sender; one I sent
 * goes to each recipient's thread.
 */
export function threadsOf(m: Message, me: string): ThreadId[] {
  if (!m.recipient_ids) return ['party']
  if (m.sender_id === me) return m.recipient_ids.filter((id) => id !== me)
  return [m.sender_id]
}
