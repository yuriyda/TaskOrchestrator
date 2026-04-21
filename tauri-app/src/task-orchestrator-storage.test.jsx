import React from 'react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import TaskOrchestrator from '@app'

function setLocalStorageMock(value) {
  Object.defineProperty(window, 'localStorage', { value, configurable: true })
  Object.defineProperty(globalThis, 'localStorage', { value, configurable: true })
}

describe('TaskOrchestrator localStorage regression', () => {
  let realLocalStorage

  beforeEach(() => {
    realLocalStorage = window.localStorage
  })

  afterEach(() => {
    cleanup()
    setLocalStorageMock(realLocalStorage)
  })

  it('renders with defaults when localStorage.getItem is unavailable', () => {
    setLocalStorageMock({})
    expect(() => render(<TaskOrchestrator />)).not.toThrow()
  })
})
