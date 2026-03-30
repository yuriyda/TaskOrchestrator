// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { isUrlAllowed, createSafeOpenUrl } from './storeApi.js'

describe('isUrlAllowed', () => {
  it('allows https URLs', () => {
    expect(isUrlAllowed('https://example.com')).toBe(true)
    expect(isUrlAllowed('https://github.com/user/repo')).toBe(true)
  })

  it('allows http URLs', () => {
    expect(isUrlAllowed('http://localhost:3000')).toBe(true)
    expect(isUrlAllowed('http://example.com')).toBe(true)
  })

  it('rejects javascript: scheme', () => {
    expect(isUrlAllowed('javascript:alert(1)')).toBe(false)
  })

  it('rejects file: scheme', () => {
    expect(isUrlAllowed('file:///etc/passwd')).toBe(false)
  })

  it('rejects data: scheme', () => {
    expect(isUrlAllowed('data:text/html,<h1>hi</h1>')).toBe(false)
  })

  it('rejects mailto: scheme', () => {
    expect(isUrlAllowed('mailto:user@example.com')).toBe(false)
  })

  it('rejects empty/null/undefined', () => {
    expect(isUrlAllowed('')).toBe(false)
    expect(isUrlAllowed(null)).toBe(false)
    expect(isUrlAllowed(undefined)).toBe(false)
  })

  it('rejects non-URL strings', () => {
    expect(isUrlAllowed('not a url')).toBe(false)
    expect(isUrlAllowed('ftp://server.com')).toBe(false)
  })
})

describe('createSafeOpenUrl', () => {
  it('calls the underlying function for allowed URLs', async () => {
    const mock = vi.fn()
    const safe = createSafeOpenUrl(mock)
    await safe('https://example.com')
    expect(mock).toHaveBeenCalledWith('https://example.com')
  })

  it('blocks disallowed URLs without calling underlying function', async () => {
    const mock = vi.fn()
    const safe = createSafeOpenUrl(mock)
    await safe('javascript:alert(1)')
    expect(mock).not.toHaveBeenCalled()
  })

  it('blocks file:// URLs', async () => {
    const mock = vi.fn()
    const safe = createSafeOpenUrl(mock)
    await safe('file:///etc/passwd')
    expect(mock).not.toHaveBeenCalled()
  })
})
