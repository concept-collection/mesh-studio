/// <reference types="vite/client" />

// Vite emits the OpenCASCADE .wasm as a static asset when imported with `?url`.
declare module '*.wasm?url' {
  const src: string
  export default src
}
