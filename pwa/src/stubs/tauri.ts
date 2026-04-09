/**
 * Stub for Tauri-specific imports in PWA mode.
 * All Tauri APIs are no-ops — the PWA uses browser equivalents.
 */

// @tauri-apps/api/core
export const invoke = async () => null

// @tauri-apps/plugin-opener
export const openUrl = (url) => window.open(url, '_blank')
export const revealItemInDir = async () => {}

// @tauri-apps/plugin-dialog
export const open = async () => null
export const save = async () => null
export const message = async () => {}
export const ask = async () => false
export const confirm = async () => false

// @tauri-apps/plugin-sql
export default class Database {
  static async load() { return new Database() }
  async execute() { return { rowsAffected: 0 } }
  async select() { return [] }
  async close() {}
}

// @tauri-apps/api/path
export const appDataDir = async () => ''
export const join = async (...parts) => parts.join('/')

// @tauri-apps/plugin-fs
export const readTextFile = async () => ''
export const writeTextFile = async () => {}
export const exists = async () => false
export const copyFile = async () => {}
export const remove = async () => {}
export const readDir = async () => []

// @tauri-apps/plugin-http
export const fetch = globalThis.fetch
