import os from "node:os";

import { Menu, nativeImage, NativeImage, Tray } from "electron";

import { mainWindow } from "./window";
import { kv as settings } from "./settings";

let icon: NativeImage | null = null;
let tooltip: string | null = null;
let menu: Menu | null = null;

let trayIcon: Tray | null = null;

export function get(): Tray | null {
  return trayIcon;
}

export function setIcon(newIcon: NativeImage) {
  if (os.platform() === "darwin") {
    // On macOS, we need to generate a set of icons with different sizes
    const image = nativeImage.createEmpty();

    const sizes = [16, 32, 64];

    for (let i = 0; i < sizes.length; i++) {
      const size = sizes[i];
      image.addRepresentation({
        scaleFactor: i + 1,
        width: size,
        height: size,
        buffer: newIcon.resize({ width: size, height: size }).toPNG(),
      });
    }

    newIcon = image;
  }
  icon = newIcon;
  if (trayIcon) {
    trayIcon.setImage(newIcon);
  }
}

export function setTooltip(newTooltip: string) {
  tooltip = newTooltip;
  if (trayIcon) {
    trayIcon.setToolTip(newTooltip);
  }
}

export function setMenu(newMenu: Menu | null) {
  menu = newMenu;
  if (trayIcon) {
    trayIcon.setContextMenu(newMenu);
  }
}

export function install() {
  if (trayIcon) {
    throw new Error("Tray icon already installed");
  }
  if (!icon) {
    throw new Error("Tray icon not initialized");
  }
  trayIcon = new Tray(icon);
  if (tooltip) {
    trayIcon.setToolTip(tooltip);
  }
  if (menu) {
    trayIcon.setContextMenu(menu);
  }
  trayIcon.on("click", async () => {
    if (!mainWindow) return;
    // Linux can only receives click, so a different behavior is used
    // The `onclick` will be send when main window is invisible, and `onrightclick` will be send when main window is visible
    mainWindow.webContents.send(
      "channel.call",
      // We only send rightclick here if is Linux, the main window is visible, and the user has not set the click behavior to "with-native-menu",
      // or, on Linux, if the user has set the click behavior to "always-show-menu", in which case we always send rightclick to show the menu
      os.platform() !== "linux" ||
        ((await settings.get("tray.clickBehavior")) !== "always-show-menu" &&
          !mainWindow.isVisible()) ||
        (await settings.get("tray.clickBehavior")) === "with-native-menu"
        ? "trayicon.onclick"
        : "trayicon.onrightclick"
    );
  });
  trayIcon.on("right-click", () => {
    if (!mainWindow) return;
    mainWindow.webContents.send("channel.call", "trayicon.onrightclick");
  });
}

export function uninstall() {
  if (!trayIcon) {
    throw new Error("Tray icon not installed");
  }
  trayIcon.destroy();
  trayIcon = null;
}
