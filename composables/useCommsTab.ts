/** The battle board's open Chat / Scribe tab, so Whisper in the stats modal can switch it. */
export type CommsTab = 'chat' | 'lore'

export function useCommsTab() {
  return useState<CommsTab>('battle-comms-tab', () => 'chat')
}

/**
 * The Chat tab's unread badge: every unread message, or none while the chat is in view.
 * One count for the battle board's Chat tab (Comms) and the phone's Chat tab (PhoneTabs).
 */
export function useChatBadge(inView: () => boolean) {
  const chat = useBoardChat()
  return computed(() => (inView() ? 0 : chat.totalUnread.value))
}
