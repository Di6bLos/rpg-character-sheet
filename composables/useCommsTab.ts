/** The battle board's open Chat / Scribe tab, so Whisper in the stats modal can switch it. */
export type CommsTab = 'chat' | 'lore'

export function useCommsTab() {
  return useState<CommsTab>('battle-comms-tab', () => 'chat')
}
