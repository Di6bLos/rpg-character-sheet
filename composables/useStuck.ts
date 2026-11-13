import type { Ref } from 'vue'

/**
 * True while a `position: sticky` element is pinned (its top has reached its
 * computed `top`), so it can show a divider only once content slides under it.
 */
export function useStuck(el: Ref<HTMLElement | null>) {
  const stuck = ref(false)

  function check() {
    const node = el.value
    if (!node) return
    const top = parseFloat(getComputedStyle(node).top)
    stuck.value =
      getComputedStyle(node).position === 'sticky' &&
      window.scrollY > 0 &&
      node.getBoundingClientRect().top <= (Number.isNaN(top) ? 0 : top) + 0.5
  }

  onMounted(() => {
    check()
    window.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('scroll', check)
    window.removeEventListener('resize', check)
  })

  return stuck
}

/**
 * After a new search, bring the content right after a pinned bar back into view,
 * just under the bar. Does nothing when that content is already visible.
 */
export function revealAfterStickyBar(bar: HTMLElement | null) {
  const next = bar?.nextElementSibling
  if (!bar || !next) return
  const overlap = bar.getBoundingClientRect().bottom - next.getBoundingClientRect().top
  if (overlap > 0) window.scrollBy({ top: -overlap })
}
