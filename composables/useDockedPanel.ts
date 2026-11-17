// A board side panel built on one <dialog>: docked (non-modal) in the page
// margin from 1200px, collapsible to a slim tab, and a modal drawer behind an
// edge tab below that. Keeping one dialog means whatever is inside stays
// mounted across resizes. Used by the quick-action panel and the Lore Master.

export const DOCK_QUERY = '(min-width: 1200px)'

export interface DockedPanelOptions {
  /** localStorage key for the remembered collapsed state. */
  collapsedKey: string
  /** Selector of the button that unfolds a collapsed panel. */
  unfoldSelector: string
  /** Selector of the button that collapses the panel (or closes the drawer). */
  dismissSelector: string
}

export function useDockedPanel(options: DockedPanelOptions) {
  const el = ref<HTMLDialogElement | null>(null)
  const wide = ref(true)
  const drawerOpen = ref(false)
  const collapsed = ref(false)

  let media: MediaQueryList | null = null
  const onMedia = () => (wide.value = !!media?.matches)

  onMounted(() => {
    media = window.matchMedia(DOCK_QUERY)
    onMedia()
    media.addEventListener('change', onMedia)
    try {
      collapsed.value = localStorage.getItem(options.collapsedKey) === '1'
    } catch {
      // Storage blocked: start expanded.
    }
  })
  onBeforeUnmount(() => media?.removeEventListener('change', onMedia))

  function setCollapsed(on: boolean) {
    collapsed.value = on
    try {
      localStorage.setItem(options.collapsedKey, on ? '1' : '0')
    } catch {
      // Not remembered; fine.
    }
    // The button that was pressed is hidden now: hand focus to its counterpart.
    nextTick(() => {
      const target = on ? options.unfoldSelector : options.dismissSelector
      el.value?.querySelector<HTMLElement>(target)?.focus()
    })
  }

  /** Opens the dialog in the mode the screen calls for. */
  function sync() {
    const dialog = el.value
    if (!dialog) return
    const modal = dialog.open && dialog.matches(':modal')
    if (wide.value) {
      if (modal) dialog.close()
      if (!dialog.open) {
        // show() focuses the first control; docked, the panel shouldn't take focus from the page.
        const before = document.activeElement
        dialog.show()
        if (before instanceof HTMLElement && before !== document.body) before.focus()
        else (document.activeElement as HTMLElement | null)?.blur()
      }
    } else if (drawerOpen.value) {
      if (!modal) {
        if (dialog.open) dialog.close()
        dialog.showModal()
      }
    } else if (dialog.open) {
      dialog.close()
    }
  }

  watch([el, wide, drawerOpen], sync, { flush: 'post' })

  function onClose() {
    drawerOpen.value = false
    // Closing the drawer when the screen widened mid-way: dock it again.
    if (wide.value) nextTick(sync)
  }

  function onBackdrop(event: MouseEvent) {
    if (!wide.value && event.target === el.value) drawerOpen.value = false
  }

  function dismiss() {
    if (wide.value) setCollapsed(true)
    else drawerOpen.value = false
  }

  const folded = computed(() => wide.value && collapsed.value)

  return { el, wide, drawerOpen, collapsed, folded, setCollapsed, onClose, onBackdrop, dismiss }
}
