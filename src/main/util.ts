import { resolve, join, normalize } from "node:path";
import os from "node:os";

import { BrowserWindow, screen } from "electron";

let photon: typeof import("@silvia-odwyer/photon-node") | null = null;
let mime: typeof import("mime") | null = null;

function ensureModule<T>(mod: T): asserts mod is NonNullable<T> {
  if (!mod) throw new Error("util is not initialized");
}

export function pngFromIco(icoData: Uint8Array): Uint8Array {
  ensureModule(photon);
  const icoImage = photon.PhotonImage.new_from_byteslice(icoData);
  const pngData = icoImage.get_bytes();
  return pngData;
}

export function normalizePath(...paths: string[]): string {
  return normalize(
    join(
      ...paths.map((path) =>
        os.platform() === "win32" ? path : path.replaceAll("\\", "/")
      )
    )
  );
}

export function sanitizeRelativePath(
  base: string,
  path: string
): string | false {
  const resolvedBase = resolve(base);
  const normalizedPath = normalizePath(path);
  const resolvedPath = resolve(join(resolvedBase, normalizedPath));
  if (!resolvedPath.startsWith(resolvedBase)) {
    return false;
  }
  return resolvedPath;
}

export function getWindowState(
  wnd: BrowserWindow
): "minimize" | "maximize" | "restore" {
  return wnd.isMinimized()
    ? "minimize"
    : wnd.isMaximized()
      ? "maximize"
      : "restore";
}

export function getWindowSizeStatus(
  wnd: BrowserWindow
): ["minimize" | "maximize" | "restore", number, number, number] {
  const bounds = wnd.getBounds();
  const screenScaleFactor = screen.getDisplayMatching(bounds).scaleFactor;
  // TODO: Confirm macOS desired behavior, Windows and Linux (Wayland) is already tested to be correct
  const scaleFactor = os.platform() === "win32" ? 1 : screenScaleFactor;
  return [
    getWindowState(wnd),
    bounds.width * scaleFactor,
    bounds.height * scaleFactor,
    screenScaleFactor,
  ];
}

export function getWindowScaleFactor(wnd: BrowserWindow): number {
  const bounds = wnd.getBounds();
  return screen.getDisplayMatching(bounds).scaleFactor;
}

export function isMusicFile(fileOrPath: string): boolean {
  ensureModule(mime);
  return mime.default.getType(fileOrPath)?.startsWith("audio/") || false;
}

export default async function initialize() {
  [photon, mime] = await Promise.all([
    import("@silvia-odwyer/photon-node"),
    import("mime"),
  ]);
}
