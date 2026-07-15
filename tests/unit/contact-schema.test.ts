import { describe, expect, it } from 'vitest'
import { contactMessageSchema } from '../../shared/schemas/contact'

describe('contact message schema', () => {
  it('normalizes a valid artist message', () => {
    const result = contactMessageSchema.parse({
      name: ' Listener ',
      email: 'LISTENER@EXAMPLE.COM',
      message: 'I would like to ask about this release.',
      consent: true,
      company: '',
    })
    expect(result.email).toBe('listener@example.com')
    expect(result.name).toBe('Listener')
  })

  it('rejects the honeypot and short messages', () => {
    expect(
      contactMessageSchema.safeParse({
        name: 'Bot',
        email: 'bot@example.com',
        message: 'Hello',
        consent: false,
        company: 'Robots Incorporated',
      }).success,
    ).toBe(false)
  })

  it('requires explicit storage consent', () => {
    expect(
      contactMessageSchema.safeParse({
        name: 'Listener',
        email: 'listener@example.com',
        message: 'This is a valid message with no consent.',
        consent: false,
        company: '',
      }).success,
    ).toBe(false)
  })
})
