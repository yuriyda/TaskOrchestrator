// @vitest-environment node
/**
 * Lint test: catches unicode escape sequences written as literal text in JSX.
 * In JSX, >\u2014< renders as the literal string "\u2014", not as "—".
 * The correct form is >{"—"}< or >{"\u2014"}<.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const UI_DIR = path.resolve(__dirname)

describe('JSX unicode escapes', () => {
  it('no \\uXXXX sequences in JSX text content (outside JS expressions)', () => {
    const files = fs.readdirSync(UI_DIR).filter(f => f.endsWith('.jsx'))
    const problems = []

    for (const file of files) {
      const src = fs.readFileSync(path.join(UI_DIR, file), 'utf8')
      const lines = src.split('\n')

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        // Match >...< content containing \uXXXX that is NOT inside {" "} or template literal
        const matches = [...line.matchAll(/>[^<{]*\\u[0-9a-fA-F]{4}[^<]*</g)]
        if (matches.length > 0) {
          problems.push(`${file}:${i + 1}: ${line.trim()}`)
        }
      }
    }

    expect(problems).toEqual([])
  })
})
