import '@testing-library/jest-dom/vitest'

// @xyflow/react requires ResizeObserver which jsdom does not provide
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
