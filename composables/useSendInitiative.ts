import { supabase } from '~/lib/supabase'

/**
 * Sends the hero's Initiative to their campaign's tracker (`set_my_initiative`),
 * returning a note for the result line (empty when the hero isn't in a campaign) and
 * whether the write failed, so the caller can offer to send the same total again.
 */
export function useSendInitiative() {
  const { draft, campaignId } = useSheet()
  return async (total: number): Promise<{ note: string; failed: boolean }> => {
    const campaign = campaignId.value
    if (!campaign) return { note: '', failed: false }
    const { data, error } = await supabase.rpc('set_my_initiative', {
      p_campaign: campaign,
      p_character: draft.value.id,
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
}
