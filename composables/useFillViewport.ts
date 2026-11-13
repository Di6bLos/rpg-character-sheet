import type { Ref } from 'vue'

type El = Ref<HTMLElement | null>

/**
 * Height that lets a scrolling list (`el`) fill the window from where it starts down
 * to the bottom, so the list scrolls under its controls instead of the page growing.
 *
 * It keeps the space that belongs under the list: whatever its `panel` holds below it
 * (padding, a "Load more" bar) and the page padding below the page's `root` element.
 * Neither depends on the list's own height, so measuring never feeds back on itself.
 * Re-measured on window resize and when any `observe` element changes size (a filter
 * bar that wraps, controls that appear).
 */
export function useFillViewport(
  el: El,
  opts: { panel?: El; root?: El; observe?: El[]; min?: number } = {},
) {
  const height = ref<number | null>(null)
  const { min = 320 } = opts

  function measure() {
    const list = el.value
    if (!list) return
    const panel = opts.panel?.value ?? list
    const root = opts.root?.value ?? panel
    const y = window.scrollY
    const top = list.getBoundingClientRect().top + y
    const insideGap = panel.getBoundingClientRect().bottom + y - (top + list.offsetHeight)
    // Page padding: the root's own bottom padding plus anything under the root.
    const pageGap =
      (root === panel ? 0 : parseFloat(getComputedStyle(root).paddingBottom)) +
      document.documentElement.scrollHeight -
      (root.getBoundingClientRect().bottom + y)
    const fill = window.innerHeight - top - Math.max(0, insideGap) - Math.max(0, pageGap)
    height.value = Math.max(min, Math.floor(fill))
  }

  // The list can be swapped for a spinner while loading; measure again when it returns.
  watch(el, (now) => {
    if (now) void nextTick(measure)
  })

  let observer: ResizeObserver | null = null
  onMounted(() => {
    measure()
    window.addEventListener('resize', measure)
    observer = new ResizeObserver(() => measure())
    for (const o of opts.observe ?? []) if (o.value) observer.observe(o.value)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('resize', measure)
    observer?.disconnect()
  })

  return { height, measure }
}
