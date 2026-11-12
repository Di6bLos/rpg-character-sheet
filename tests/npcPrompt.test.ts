import { describe, expect, it } from 'vitest'
import { systemPrompt, userPrompt } from '../supabase/functions/generate-npc/prompt'

const base = {
  description: 'A mind-eating aberration',
  kind: 'monster' as const,
  threat: 'Standard' as const,
  system: 'nimble' as const,
  level: '1',
  partyLevel: false,
  budget: ['HP target: 20'],
  sourceSystem: 'auto',
  fileNames: ['stat-block.pdf'],
  followStatBlock: true,
}

describe('generate-npc prompt', () => {
  it('leaves out threat, level and targets when following an uploaded stat block', () => {
    const prompt = userPrompt(base)
    expect(prompt).toContain('Follow the attached stat block')
    expect(prompt).not.toContain('Threat:')
    expect(prompt).not.toContain('Level: 1')
    expect(prompt).not.toContain('HP target')
  })

  it('rebuilds an uploaded stat block at the picks when the toggle is off', () => {
    const prompt = userPrompt({ ...base, followStatBlock: false })
    expect(prompt).toContain('Threat: a standard foe')
    expect(prompt).toContain('Level: 1')
    expect(prompt).toContain('HP target: 20')
    expect(prompt).toContain('rebuild it at the threat and level above')
  })

  it('ignores the toggle without an upload', () => {
    const prompt = userPrompt({ ...base, fileNames: [] })
    expect(prompt).toContain('Level: 1')
    expect(prompt).not.toContain('Follow the attached stat block')
  })

  it('explains both ways of using an uploaded stat block', () => {
    for (const system of ['nimble', 'dnd5e', 'pf2e'] as const) {
      const prompt = systemPrompt(system)
      expect(prompt).toContain('- Follow it:')
      expect(prompt).toContain('- Rebuild it:')
    }
  })
})
