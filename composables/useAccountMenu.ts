/**
 * The account menu's actions, shared by the app nav (`layouts/default.vue`) and the
 * phone battle board's campaign menu, which stands in for the nav there.
 */
export function useAccountMenu() {
  const auth = useAuthStore()
  const snackbar = useSnackbarStore()

  // "Manual dice", for all the player's heroes.
  const ownDice = computed(() => auth.profile?.own_dice ?? false)
  const savingDice = ref(false)
  async function toggleOwnDice() {
    savingDice.value = true
    try {
      await auth.updateProfile({ own_dice: !ownDice.value })
    } catch (err) {
      snackbar.error(err, 'Could not change how dice are rolled')
    } finally {
      savingDice.value = false
    }
  }

  async function signOut() {
    await auth.logout()
    await navigateTo('/')
  }

  return { ownDice, savingDice, toggleOwnDice, signOut }
}
