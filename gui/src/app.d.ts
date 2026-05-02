// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type * as KV from "../../src/storage";

declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }

  interface Window {
    kv: typeof KV;
  }

  const kv: typeof KV;

  const __APP_VERSION__: string;
}

export {};
