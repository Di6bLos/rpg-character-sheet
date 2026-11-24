/**
 * The drag handle logic for a battle board side column (`BattleSplitter` events): drag
 * to resize, all the way to closed (a thin rail) and back; a click opens or closes it
 * (reopening at its last width); arrow keys step it, Home / End go to the limits.
 * `side` says where the column is: the left column's handle is on its right edge
 * (dragging right widens it), the right column's on its left edge.
 */
import type { MaybeRefOrGetter } from 'vue'

export interface ColumnHandleOptions {
  side: 'left' | 'right'
  /** Read on every move. */
  bounds: MaybeRefOrGetter<{ min: number; max: number; close: number }>
  open: () => boolean
  /** The open column's saved width. */
  width: () => number
  /** Its width on screen now (the CSS may cap it below `width`). */
  measure: () => number
  /** The widest it may go now (it never squeezes the centre column too far). */
  limit: () => number
  setOpen: (open: boolean, save: boolean) => void
  setWidth: (px: number, save: boolean) => void
  /** Closes the column, remembering `px` for when it opens again. */
  closeAt: (px: number) => void
  save: () => void
}

/** Dragging the closed rail this far opens the column at its minimum width. */
const OPEN_PULL = 24
const KEY_STEP = 24

export function useColumnHandle(o: ColumnHandleOptions) {
  // Pointer moves are in screen px: a left column grows with a move right.
  const grow = o.side === 'left' ? 1 : -1
  let dragWidth: number | null = null
  // Whether this drag began on the closed rail: only then does a short pull open it
  // (a drag that closes the column mid-way must stay closed while it carries on).
  let fromRail = false
  /** The width the drag began at, kept for reopening when the drag closes the column. */
  let startWidth = 0

  const current = () => (o.open() ? o.measure() : 0)
  const bounds = () => toValue(o.bounds)

  /** Narrower than the close point: closed; otherwise open at that width. */
  function apply(px: number, save: boolean) {
    if (px < bounds().close) o.setOpen(false, save)
    else o.setWidth(Math.min(px, o.limit()), save)
  }

  function onMove(delta: number) {
    if (dragWidth === null) {
      fromRail = !o.open()
      dragWidth = current()
      startWidth = o.open() ? o.width() : 0
    }
    dragWidth += grow * delta
    if (fromRail && !o.open()) {
      if (dragWidth < OPEN_PULL) return
      dragWidth = bounds().min
    }
    apply(dragWidth, false)
  }

  function onTap() {
    if (o.open()) o.closeAt(o.width())
    else o.setWidth(o.width(), true)
  }

  function onKey(step: 'less' | 'more' | 'min' | 'max') {
    // Keys follow the screen: on the left column Right widens and Home closes it,
    // on the right column Left widens and End closes it.
    const widen = o.side === 'left' ? 'more' : 'less'
    const close = o.side === 'left' ? 'min' : 'max'
    if (step === close) return o.setOpen(false, false)
    if (step !== 'less' && step !== 'more') return apply(bounds().max, false)
    if (!o.open()) return step === widen ? apply(o.width(), false) : undefined
    const now = current()
    apply(step === widen ? now + KEY_STEP : Math.max(now - KEY_STEP, bounds().close - 1), false)
  }

  function onDrop() {
    // Dragged shut: a click reopens it at the width it had before.
    if (!o.open() && startWidth) o.closeAt(startWidth)
    else o.save()
    dragWidth = null
    fromRail = false
    startWidth = 0
  }

  return { onMove, onTap, onKey, onDrop }
}
