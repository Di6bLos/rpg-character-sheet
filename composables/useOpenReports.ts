import { supabase } from '~/lib/supabase'

const openCount = ref(0)

/** Shared count of open reports for the admin side navigation. */
export function useOpenReports() {
  async function refresh() {
    const { count } = await supabase
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')
    openCount.value = count ?? 0
  }

  return { openCount, refresh }
}
