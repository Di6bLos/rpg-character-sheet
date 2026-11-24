import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLongPress } from '~/composables/useLongPress'

// No DOM in this suite: a bare EventTarget stands in for the window.
let target = new EventTarget()
const down = (x = 10, y = 10) =>
  ({ pointerType: 'touch', clientX: x, clientY: y, currentTarget: {} }) as never

function click() {
  const e = new Event('click', { cancelable: true })
  target.dispatchEvent(e)
  return e.defaultPrevented
}

beforeEach(() => {
  target = new EventTarget()
  vi.useFakeTimers()
  vi.stubGlobal('window', target)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useLongPress', () => {
  it('fires at 500ms and still swallows the click after a long hold', () => {
    const onPress = vi.fn()
    const p = useLongPress(onPress)
    p.onPointerdown(down())
    vi.advanceTimersByTime(500)
    expect(onPress).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1500) // held well past the old 800ms expiry
    p.onPointerup()
    expect(click()).toBe(true)
    expect(click()).toBe(false) // only the one click
  })

  it('blocks the native contextmenu from pointerdown, before the timer', () => {
    const p = useLongPress(vi.fn())
    p.onPointerdown(down())
    const e = new Event('contextmenu', { cancelable: true })
    target.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
  })

  it('an early pointerup does not press and lets the click through', () => {
    const onPress = vi.fn()
    const p = useLongPress(onPress)
    p.onPointerdown(down())
    vi.advanceTimersByTime(300)
    p.onPointerup()
    vi.advanceTimersByTime(1000)
    expect(onPress).not.toHaveBeenCalled()
    expect(click()).toBe(false)
  })

  it('moving more than 8px cancels', () => {
    const onPress = vi.fn()
    const p = useLongPress(onPress)
    p.onPointerdown(down())
    p.onPointermove({ clientX: 19, clientY: 10 } as never)
    vi.advanceTimersByTime(600)
    expect(onPress).not.toHaveBeenCalled()
  })

  it('when disabled it does nothing and blocks nothing', () => {
    const onPress = vi.fn()
    const p = useLongPress(onPress, () => false)
    p.onPointerdown(down())
    vi.advanceTimersByTime(600)
    p.onPointerup()
    const e = new Event('contextmenu', { cancelable: true })
    target.dispatchEvent(e)
    expect(onPress).not.toHaveBeenCalled()
    expect(e.defaultPrevented).toBe(false)
    expect(click()).toBe(false)
  })
})
