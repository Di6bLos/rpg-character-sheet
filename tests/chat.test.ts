import { describe, expect, it } from 'vitest'
import type { Message } from '../types'
import { threadsOf } from '../utils/chat'

const msg = (patch: Partial<Message>): Message => ({
  id: 'm',
  campaign_id: 'c',
  sender_id: 'gm',
  body: 'hi',
  recipient_ids: null,
  created_at: '',
  ...patch,
})

describe('threadsOf', () => {
  it('puts party messages in the party thread', () => {
    expect(threadsOf(msg({}), 'ana')).toEqual(['party'])
  })
  it('files a private message I received under its sender', () => {
    expect(threadsOf(msg({ recipient_ids: ['ana'] }), 'ana')).toEqual(['gm'])
  })
  it('files a private message I sent under each recipient', () => {
    expect(threadsOf(msg({ sender_id: 'gm', recipient_ids: ['ana', 'bo'] }), 'gm')).toEqual([
      'ana',
      'bo',
    ])
  })
})
