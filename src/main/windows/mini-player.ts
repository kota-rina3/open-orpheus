import { join } from "node:path";

import { BrowserWindow } from "electron";
import photon from "@silvia-odwyer/photon-node";

import { mainWindow, setWindowId } from "../window";
import { registerIpcHandlers } from "../../bridge/register";
import {
  MiniPlayerContract,
  MiniPlayerPlayInfo,
  MiniPlayerPlayState,
  MiniPlayerListElement,
  MiniPlayerFullState,
  MiniPlayerStyle,
} from "../../bridge/contracts/mini-player-api";
import type { BtnImages, BtnState } from "../../../types/dui";
import { dragWindow } from "@open-orpheus/window";
import { registerInputRegionHandlers } from "../../bridge/common/inputRegion";
import packManager from "../pack";
import SkinPack from "../packs/SkinPack";
import { extractColor } from "../skin/color";
import { DOMParser, Element } from "@xmldom/xmldom";
import { argbToCss, parseBtnState } from "../skin/dui";

let miniPlayerWindow: BrowserWindow | null = null;

// State
let playInfo: MiniPlayerPlayInfo | null = null;
let coverUrl: string | null = null;
let likeMark = false;
let currentPlay: string | null = null;
let playState: MiniPlayerPlayState = { playing: false };
let listItems: MiniPlayerListElement[] = [];

function btn(icon: string, color = "#333333"): BtnImages {
  return {
    normal: { uri: `gui://skin/btn/${icon}.svg`, color },
    hot: { uri: `gui://skin/btn/${icon}.svg`, color },
    pushed: { uri: `gui://skin/btn/${icon}.svg`, color },
  };
}

const defaultStyle: MiniPlayerStyle = {
  background: "#ffffff",
  titleColor: "#1a1a1a",
  artistColor: "#666666",

  prevButton: btn("previous"),
  playButton: {
    normal: { uri: `gui://skin/btn/toplay.svg`, color: "#333333" },
    hot: { uri: `gui://skin/btn/toplay_over.svg`, color: "#333333" },
    pushed: { uri: `gui://skin/btn/toplay_over.svg`, color: "#333333" },
  },
  pauseButton: {
    normal: { uri: `gui://skin/btn/topause.svg`, color: "#333333" },
    hot: { uri: `gui://skin/btn/topause_over.svg`, color: "#333333" },
    pushed: { uri: `gui://skin/btn/topause_over.svg`, color: "#333333" },
  },
  nextButton: btn("next"),

  loveButton: btn("love"),
  lovedButton: btn("loved"),

  volumeButton: btn("voice"),
  volumeMutedButton: btn("voice_muted"),

  listButton: btn("showlist"),

  closeButton: btn("close"),
  toWebButton: btn("toweb"),

  list: {
    background: "rgba(255,255,255,0.93)",
    itemBackground: "rgba(0,0,0,0.03)",
    hoverBackground: "rgba(0,0,0,0.05)",
    selectedBackground: "rgba(0,0,0,0.08)",
    playingBackground: "rgba(59,130,246,0.12)",
  },
};

let style: MiniPlayerStyle = defaultStyle;

packManager.addEventListener("skin2packloaded", async () => {
  const skinPack = packManager.getPack<SkinPack>("skin2");
  const [
    bg,
    //listBg,
    listItemBg,
    listHoverBg,
    listSelectedBg,
    listPlayingBg,
    skinBuf,
  ] = await Promise.all(
    [
      "/mini/main/panel.png",
      "/mini/list/bk.png",
      "/mini/list/itmbk.png",
      "/mini/list/hover.png",
      "/mini/list/selected.png",
      "/mini/list/playing.png",
      "/mini/skin.xml",
    ].map((p) => skinPack.readFile(p))
  );
  const [
    bgColor,
    //listBgColor, // TODO: photon is unhappy with dark skin's bk.png
    listItemBgColor,
    listHoverBgColor,
    listSelectedBgColor,
    listPlayingBgColor,
  ] = await Promise.all(
    [bg, /* listBg,  */ listItemBg, listHoverBg, listSelectedBg, listPlayingBg]
      .map((buf) => photon.PhotonImage.new_from_byteslice(buf))
      .map(extractColor)
  );

  const xml = skinBuf.toString("utf-8");
  const doc = new DOMParser().parseFromString(xml, "text/xml");

  const style: Partial<MiniPlayerStyle> = {};

  style.background = bgColor;
  style.list = {
    //background: listBgColor,
    background: "white",
    itemBackground: listItemBgColor,
    hoverBackground: listHoverBgColor,
    selectedBackground: listSelectedBgColor,
    playingBackground: listPlayingBgColor,
  };

  const labels = doc.getElementsByTagName("Label");
  let labelsFound = 0;
  for (const label of labels) {
    const name = label.getAttribute("name");
    if (name === "no_lrc_title") {
      style.titleColor = argbToCss(label.getAttribute("textcolor")!);
      labelsFound++;
    } else if (name === "no_lrc_artist") {
      style.artistColor = argbToCss(label.getAttribute("textcolor")!);
      labelsFound++;
    }
    if (labelsFound >= 2) break;
  }

  const parseWrapper = (attr: string): BtnState | null => {
    const state = parseBtnState(attr);
    if (!state) return null;
    state.uri = `gui://skin2/${state.uri}`;
    return state;
  };

  const extractBtnImagesFromElement = (el: Element): BtnImages | null => {
    const normal = el.getAttribute("normalimage");
    const hot = el.getAttribute("hotimage");
    const pushed = el.getAttribute("pushedimage");
    if (!normal) return null;
    const images: BtnImages = {
      normal: parseWrapper(normal)!,
    };
    if (hot) images.hot = parseWrapper(hot)!;
    if (pushed) images.pushed = parseWrapper(pushed)!;
    return images;
  };

  const buttons = doc.getElementsByTagName("Button");
  let btnsFound = 0;
  for (const btn of buttons) {
    const name = btn.getAttribute("name");
    btnsFound++; // Simpler casing
    switch (name) {
      case "previous": {
        style.prevButton = extractBtnImagesFromElement(btn) ?? undefined;
        break;
      }
      case "toplay": {
        style.playButton = extractBtnImagesFromElement(btn) ?? undefined;
        break;
      }
      case "topause": {
        style.pauseButton = extractBtnImagesFromElement(btn) ?? undefined;
        break;
      }
      case "next": {
        style.nextButton = extractBtnImagesFromElement(btn) ?? undefined;
        break;
      }
      case "like": {
        // We only accept first two like btns.
        if (style.lovedButton) {
          btnsFound--;
          break;
        }
        if (style.loveButton) {
          style.lovedButton = extractBtnImagesFromElement(btn) ?? undefined;
        } else {
          style.loveButton = extractBtnImagesFromElement(btn) ?? undefined;
        }
        break;
      }
      case "volume": {
        style.volumeButton = extractBtnImagesFromElement(btn) ?? undefined;
        break;
      }
      case "volume_mute": {
        style.volumeMutedButton = extractBtnImagesFromElement(btn) ?? undefined;
        break;
      }
      case "show_list": {
        style.listButton = extractBtnImagesFromElement(btn) ?? undefined;
        break;
      }
      case "window_close": {
        style.closeButton = extractBtnImagesFromElement(btn) ?? undefined;
        break;
      }
      case "toweb": {
        style.toWebButton = extractBtnImagesFromElement(btn) ?? undefined;
        break;
      }
      default:
        btnsFound--;
        break;
    }
    if (btnsFound >= 11) break;
  }

  updateStyle(style as MiniPlayerStyle);
});

function sendToMiniPlayer(event: string, data: unknown) {
  if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
    miniPlayerWindow.webContents.send(`miniPlayer.${event}`, data);
  }
}

export function updatePlayInfo(info: MiniPlayerPlayInfo | null) {
  playInfo = info;
  sendToMiniPlayer("playInfoUpdate", info);
}

export function updateCoverUrl(url: string | null) {
  coverUrl = url;
  sendToMiniPlayer("coverUpdate", url);
}

export function updateLikeMark(liked: boolean) {
  likeMark = liked;
  sendToMiniPlayer("likeUpdate", liked);
}

export function updatePlayState(playing: boolean) {
  playState = { playing };
  sendToMiniPlayer("playStateUpdate", playState);
}

export function updateListData(
  items: MiniPlayerListElement[],
  cp: string | null
) {
  listItems = items;
  currentPlay = cp;
  sendToMiniPlayer("listUpdate", { items, currentPlay });
}

export function showVolume(volume: number, muted: boolean) {
  sendToMiniPlayer("showVolume", [volume, muted]);
}

export function updateStyle(newStyle: MiniPlayerStyle | null) {
  style = newStyle ?? defaultStyle;
  sendToMiniPlayer("styleUpdate", newStyle);
}

export function getFullState(): MiniPlayerFullState {
  return {
    playInfo,
    coverUrl,
    likeMark,
    currentPlay,
    playState,
    listItems,
    style,
  };
}

export default function createMiniPlayerWindow() {
  miniPlayerWindow = new BrowserWindow({
    width: 310,
    height: 50 + 340, // Total size: Main + List
    transparent: true,
    hasShadow: false,
    frame: false,
    resizable: false,
    show: false,
    roundedCorners: false,
    title: "Open Orpheus Mini Player",
    webPreferences: {
      partition: "open-orpheus",
      preload: join(__dirname, "mini-player.js"),
    },
  });
  if (GUI_VITE_DEV_SERVER_URL) {
    miniPlayerWindow.loadURL(`${GUI_VITE_DEV_SERVER_URL}/mini-player`);
  } else {
    miniPlayerWindow.loadURL("gui://frontend/mini-player");
  }
  setWindowId(miniPlayerWindow, "mini_player");

  registerIpcHandlers<MiniPlayerContract>(
    miniPlayerWindow.webContents,
    "miniPlayer",
    {
      requestFullUpdate: async () => getFullState(),
      dragWindow: async () => {
        if (!miniPlayerWindow || miniPlayerWindow.isDestroyed()) return;
        const hwnd = miniPlayerWindow.getNativeWindowHandle();
        dragWindow(hwnd);
      },
      fireCall: async (event, cmd, ...args) => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.webContents.send("channel.call", cmd, ...args);
      },
    }
  );
  registerInputRegionHandlers(miniPlayerWindow);
}
