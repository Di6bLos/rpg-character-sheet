import { describe, expect, it } from 'vitest'
import { ruleKey, tipText } from '../utils/ruleTips'

describe('ruleTips', () => {
  it('names a property or trait without its number or die', () => {
    expect(ruleKey('Reach 2')).toBe('reach')
    expect(ruleKey('deadly d8')).toBe('deadly')
    expect(ruleKey('Load: 1 action')).toBe('load')
    expect(ruleKey('2-handed')).toBe('2-handed')
    expect(ruleKey('Agile')).toBe('agile')
  })

  it('turns markdown into short plain text', () => {
    expect(tipText('**Trigger** A foe _moves_.\n\n---\nMore')).toBe('Trigger A foe moves.\nMore')
    expect(tipText('x'.repeat(50), 10)).toBe(`${'x'.repeat(9)}…`)
  })
})
