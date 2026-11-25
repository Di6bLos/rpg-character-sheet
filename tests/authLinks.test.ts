import { describe, expect, it } from 'vitest'
import { RECOVERY_MAX_MS, readAuthLink, recoveryStillValid } from '../utils/authLinks'

const at = (hash: string, search = '') => ({ hash, pathname: '/reset-password', search })

describe('readAuthLink', () => {
  it('reports an expired link with its description and drops the hash', () => {
    expect(
      readAuthLink(
        at(
          '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
        ),
      ),
    ).toEqual({ error: 'Email link is invalid or has expired', cleanUrl: '/reset-password' })
  })

  it('reports an already-used link that carries only an error code', () => {
    expect(readAuthLink(at('#error_code=otp_expired', '?from=mail'))).toEqual({
      error: 'This reset link isn’t valid.',
      cleanUrl: '/reset-password?from=mail',
    })
  })

  it('finds no error in a recovery session hash but still drops the tokens', () => {
    expect(readAuthLink(at('#access_token=abc&refresh_token=def&type=recovery'))).toEqual({
      error: '',
      cleanUrl: '/reset-password',
    })
  })

  it('leaves an address with no hash alone', () => {
    expect(readAuthLink(at(''))).toEqual({ error: '', cleanUrl: null })
  })
})

describe('recoveryStillValid', () => {
  const mark = JSON.stringify({ userId: 'ana', at: 1000 })

  it('keeps a reset of the same user within the link lifetime', () => {
    expect(recoveryStillValid(mark, 'ana', 1000 + RECOVERY_MAX_MS - 1)).toBe(true)
  })
  it('drops it once the link lifetime has passed', () => {
    expect(recoveryStillValid(mark, 'ana', 1000 + RECOVERY_MAX_MS)).toBe(false)
  })
  it('drops it for another user or no session', () => {
    expect(recoveryStillValid(mark, 'bo', 2000)).toBe(false)
    expect(recoveryStillValid(mark, null, 2000)).toBe(false)
  })
  it('drops a missing or unreadable mark', () => {
    expect(recoveryStillValid(null, 'ana', 2000)).toBe(false)
    expect(recoveryStillValid('{oops', 'ana', 2000)).toBe(false)
    expect(recoveryStillValid(JSON.stringify({ userId: 'ana' }), 'ana', 2000)).toBe(false)
  })
})
