import { supabase } from '~/lib/supabase'

/**
 * Sends the hero's Initiative to their campaign's tracker (`set_my_initiative`),
 * returning a note for the result line. Empty when the hero isn't seated in a campaign.
 */
export function useSendInitiative() {
  const { draft, campaignId } = useSheet()
  return async (total: number): Promise<string> => {
    const campaign = campaignId.value
    if (!campaign) return ''
    const { data, error } = await supabase.rpc('set_my_initiative', {
      p_campaign: campaign,
      p_character: draft.value.id,
      p_initiative: total,
    })
    if (error) return ' Could not update the initiative tracker.'
    return data
      ? ' Sent to the GM’s initiative tracker.'
      : ' Not on the initiative tracker yet: the GM adds you when combat starts.'
  }
}
