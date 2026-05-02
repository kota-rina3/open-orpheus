import type { WebContents, IpcMainInvokeEvent } from "electron";

// Extract handler-leaves from a contract: functions become ipc.handle callbacks,
// nested objects are recursed.  Scalars, arrays, and the "events" subtree are
// excluded — "events" is always push-from-main (ipcRenderer.on), never handled.
type DeepIpcHandlers<T> = {
  [K in keyof T as K extends "events"
    ? never
    : T[K] extends (...args: never[]) => unknown
      ? K
      : T[K] extends Record<string, unknown>
        ? T[K] extends unknown[]
          ? never
          : K
        : never]: T[K] extends (...args: infer A) => infer R
    ? (event: IpcMainInvokeEvent, ...args: A) => R | Promise<R>
    : T[K] extends Record<string, unknown>
      ? DeepIpcHandlers<T[K]>
      : never;
};

export function registerIpcHandlers<T>(
  wc: WebContents,
  prefix: string,
  handlers: DeepIpcHandlers<T>
): void {
  const seen = new Set<string>();

  function walk(obj: Record<string, unknown>, path: string[]) {
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = [...path, key];
      if (typeof value === "function") {
        const channel = currentPath.join(".");
        if (seen.has(channel)) {
          throw new Error(`Duplicate IPC channel: "${channel}"`);
        }
        seen.add(channel);
        wc.ipc.handle(channel, value as (...args: unknown[]) => unknown);
      } else if (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value)
      ) {
        walk(value as Record<string, unknown>, currentPath);
      }
    }
  }

  walk(handlers as Record<string, unknown>, [prefix]);
}
