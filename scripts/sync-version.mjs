#!/usr/bin/env node
/**
 * @file sync-version.js
 * Syncs version from shared/version.json (single source of truth)
 * into tauri-app/package.json and tauri-app/src-tauri/tauri.conf.json.
 * Run before build or after bumping the version.
 */
import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const { version } = JSON.parse(readFileSync(resolve(root, 'shared/version.json'), 'utf-8'))

const targets = [
  'tauri-app/package.json',
  'tauri-app/src-tauri/tauri.conf.json',
]

for (const rel of targets) {
  const filePath = resolve(root, rel)
  const content = JSON.parse(readFileSync(filePath, 'utf-8'))
  if (content.version !== version) {
    content.version = version
    writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n')
    console.log(`✓ ${rel} → ${version}`)
  } else {
    console.log(`  ${rel} — already ${version}`)
  }
}
