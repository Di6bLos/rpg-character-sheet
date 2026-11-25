import { supabase } from '~/lib/supabase'

/**
 * Sends a hero's Initiative to their campaign's tracker (`set_my_initiative`), returning a
 * note for the result line and whether the write failed, so the caller can offer to send
 * the same total again. Used by the Nimble sheet (`useSendInitiative`) and the battle
 * board's basic turn bar for other systems (`components/battle/TurnBasic.vue`).
 */
export async function sendInitiative(
  campaignId: string,
  characterId: string,
  total: number,
): Promise<{ note: string; failed: boolean }> {
  const { data, error } = await supabase.rpc('set_my_initiative', {
    p_campaign: campaignId,
    p_character: characterId,
    p_initiative: total,
  })
  if (error) return { note: ' Could not update the initiative tracker.', failed: true }
  return {
    note: data
      ? ' Sent to the GM’s initiative tracker.'
      : ' Not on the initiative tracker yet: the GM adds you when combat starts.',
    failed: false,
  }
}

/**
 * `sendInitiative` for the hero in the current sheet editor; the note is empty when the
 * hero isn't in a campaign.
 */
export function useSendInitiative() {
  const { draft, campaignId } = useSheet()
  return async (total: number): Promise<{ note: string; failed: boolean }> => {
    const campaign = campaignId.value
    if (!campaign) return { note: '', failed: false }
    return sendInitiative(campaign, draft.value.id, total)
  }
}
