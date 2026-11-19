/**
 * Posts a result of the hero in the current sheet editor to party chat as an action
 * ("Iriel · Zap: 11"), the way the quick-action panel and the battle board share rolls.
 * Use inside a campaign board's sheet editor.
 */
export function useAnnounce(): (message: string) => void {
  const { draft } = useSheet()
  const chat = useBoardChat()
  return (message: string) => {
    void chat.send(`${draft.value.name} · ${message}`, 'party', 'action')
  }
}
