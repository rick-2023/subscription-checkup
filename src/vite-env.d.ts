/// <reference types="vite/client" />

declare global {
  interface ImportMetaEnv {
    readonly VITE_AI_ENDPOINT?: string
  }
}

export {}
