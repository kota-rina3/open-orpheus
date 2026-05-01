import { ipcRenderer } from "electron";
import SDK from "@yxim/nim-web-sdk";
import type { NIMChatroomMessage } from "@yxim/nim-web-sdk/dist/types/chatroom/NIMChatroomMessageInterface";

import { IPC, NIM_APP_KEY } from "../shared/listenTogetherConstants";
import { fireNativeCall } from "./channel";
import {
  extractListenTogetherCommandInfo,
  getCommandSongId,
  normalizeCommandToken,
} from "../shared/listenTogetherCommand";
import {
  suppressListenTogetherPlaybackResume,
  suppressListenTogetherRemoteChangeEcho,
} from "./audioplayer";

// ===== State =====

let nimInstance: SDK.NIM | null = null;
let nimInstancePromise: Promise<SDK.NIM> | null = null;
let chatroomInstance: SDK.Chatroom | null = null;
let chatroomConnected = false;
let intentionalChatroomDisconnect = false;
let currentChatroomId: string | null = null;
let loginSessionId = 0;
let nimAccount = "";

export const imState: { connected: boolean; chatRoomId: string | null } = {
  connected: false,
  chatRoomId: null,
};

// ===== Helpers =====

function setConnectionState(nextState: string) {
  imState.connected = nextState === "connected";
}

function setChatRoomState(_nextState: string, chatRoomId: string | null) {
  imState.chatRoomId = chatRoomId;
  currentChatroomId = chatRoomId;
}

function resetIMState() {
  imState.connected = false;
  imState.chatRoomId = null;
}

function notifyMainChatroomConnected() {
  ipcRenderer.send(IPC.LT_CHATROOM_CONNECTED);
}

function notifyMainChatroomLeave() {
  ipcRenderer.send(IPC.NIM_LEAVE_CHATROOM);
}

function toChatRoomMsgText(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  if (value && typeof value === "object") return JSON.stringify(value);
  return null;
}

// TODO: Confirm if `msg` is a valid field
const CHAT_ROOM_MESSAGE_TEXT_KEYS: (keyof NIMChatroomMessage)[] = [
  /* "msg",  */ "text",
  "content",
  "attach",
  "custom",
];
function getChatRoomMsgText(msg: NIMChatroomMessage) {
  for (const key of CHAT_ROOM_MESSAGE_TEXT_KEYS) {
    const text = toChatRoomMsgText(msg[key]);
    if (text) return text;
  }
  return "";
}

function normalizeChatRoomMsg(msg: NIMChatroomMessage) {
  const text = getChatRoomMsgText(msg);
  return {
    ...msg,
    msg: text,
  };
}

function summarizePayload(payload: string) {
  return payload.replace(/\s+/g, " ").slice(0, 500);
}

function suppressRemoteCommandEcho(payload: string) {
  const command = extractListenTogetherCommandInfo(payload);
  if (!command) return;
  const commandType = normalizeCommandToken(command.commandType);
  const playStatus = normalizeCommandToken(command.playStatus);
  const songId = getCommandSongId(command);
  if (commandType === "PAUSE" || playStatus === "PAUSE") {
    suppressListenTogetherPlaybackResume(songId);
    return;
  }
  if (
    commandType === "NEXT" ||
    commandType === "PROGRESS" ||
    commandType === "GOTO"
  ) {
    suppressListenTogetherRemoteChangeEcho(songId);
  }
}

// ===== IM Management =====

function destroyIMInstance() {
  nimInstancePromise = null;
  if (nimInstance) {
    try {
      nimInstance.destroy({});
    } catch (e) {
      console.warn("[YunxinIM] destroy IM instance error:", e);
    }
    nimInstance = null;
  }
  chatroomConnected = false;
  nimAccount = "";
}

async function initIMInstance(
  account: string,
  token: string
): Promise<SDK.NIM> {
  const existing = nimInstance;
  if (existing && nimAccount === account) {
    console.log("[YunxinIM] reusing existing NIM instance, account:", account);
    return existing;
  }

  if (nimInstancePromise && nimAccount === account) {
    console.log(
      "[YunxinIM] IM init already in progress, reusing pending promise"
    );
    return nimInstancePromise;
  }

  if (existing) {
    console.log(
      "[YunxinIM] destroying previous NIM instance, account changed:",
      nimAccount,
      "->",
      account
    );
    destroyIMInstance();
  }

  nimAccount = account;
  let pendingInstance: SDK.NIM | null = null;
  nimInstancePromise = new Promise<SDK.NIM>((resolve, reject) => {
    let done = false;
    const timeout = setTimeout(() => {
      if (!done) {
        done = true;
        nimInstancePromise = null;
        if (pendingInstance) {
          try {
            pendingInstance.destroy({});
          } catch {
            /* */
          }
        }
        nimInstance = null;
        reject(new Error("NIM connect timeout"));
      }
    }, 15000);

    pendingInstance = SDK.NIM.getInstance({
      appKey: NIM_APP_KEY,
      account,
      token,
      db: false,
      syncRelations: false,
      syncFriends: false,
      syncFriendUsers: false,
      syncTeams: false,
      syncExtraTeamInfo: false,
      syncSuperTeams: false,
      syncSessionUnread: false,
      logLevel: "warn",
      onconnect: () => {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        console.log("[YunxinIM] NIM connected:", account);
        nimInstance = pendingInstance;
        nimInstancePromise = null;
        setConnectionState("connected");
        resolve(pendingInstance!);
      },
      ondisconnect: (e) => {
        console.warn("[YunxinIM] NIM disconnected:", e.code);
        nimInstancePromise = null;
        setConnectionState("disconnected");
      },
      onerror: (e: unknown) => {
        console.warn("[YunxinIM] NIM error:", e);
        if (!done && !nimInstance) {
          done = true;
          clearTimeout(timeout);
          nimInstancePromise = null;
          reject(e instanceof Error ? e : new Error("NIM connection error"));
        }
      },
      onwillreconnect: (info) => {
        console.warn(
          "[YunxinIM] NIM will reconnect, retry:",
          info?.retryCount,
          "duration:",
          info?.duration
        );
      },
    });
  });

  return nimInstancePromise;
}

// ===== Chatroom Management =====

function destroyChatroomInstance() {
  intentionalChatroomDisconnect = true;
  if (chatroomInstance) {
    try {
      chatroomInstance.disconnect({
        done(err, data) {
          // TODO: Confirm if we need to do anything here.
          console.log("chatroom done", err, data);
        },
      });
    } catch (e) {
      console.warn("[YunxinIM] disconnect chatroom error:", e);
    }
    chatroomInstance = null;
  }
  chatroomConnected = false;
  currentChatroomId = null;
  setChatRoomState("none", null);
  intentionalChatroomDisconnect = false;
}

async function initChatroomInstance(
  chatroomId: string,
  addresses: string[]
): Promise<SDK.Chatroom> {
  destroyChatroomInstance();
  setChatRoomState("entering", chatroomId);
  currentChatroomId = chatroomId;

  return new Promise<SDK.Chatroom>((resolve, reject) => {
    let done = false;
    const chatroomTimeout = setTimeout(() => {
      if (!done) {
        done = true;
        console.warn("[YunxinIM] chatroom connect timeout:", chatroomId);
        intentionalChatroomDisconnect = true;
        if (chatroomInstance) {
          try {
            chatroomInstance.disconnect({
              done(err, data) {
                // TODO: Confirm if we need to do anything here.
                console.log("chatroom done", err, data);
              },
            });
          } catch {
            /* */
          }
          chatroomInstance = null;
        }
        intentionalChatroomDisconnect = false;
        chatroomConnected = false;
        reject(new Error("Chatroom connect timeout"));
      }
    }, 15000);

    const chatroomOptions: Parameters<typeof SDK.Chatroom.getInstance>[0] = {
      secure: true,
      chatroomAddresses: addresses,
      appKey: NIM_APP_KEY,
      chatroomId,
      isAnonymous: true,
      account: undefined as unknown as string, // Type safe: isAnonymous = true
      token: undefined as unknown as string, // Type safe: isAnonymous = true
      chatroomNick: "listen_together_user",
      logLevel: "warn",
      onconnect: () => {
        if (done) return;
        done = true;
        clearTimeout(chatroomTimeout);
        console.log("[YunxinIM] chatroom connected:", chatroomId);
        chatroomConnected = true;
        setChatRoomState("entered", chatroomId);
        notifyMainChatroomConnected();
        resolve(chatroom);
      },
      ondisconnect: (e: unknown) => {
        console.warn(
          "[YunxinIM] chatroom disconnected:",
          (e as Record<string, unknown>)?.code
        );
        chatroomConnected = false;
        setChatRoomState("none", null);
        if (!intentionalChatroomDisconnect) {
          notifyMainChatroomLeave();
        }
      },
      // TODO: Confirm this exists or not
      /* onerror: (e: unknown) => {
        console.error("[YunxinIM] chatroom error:", (e as Record<string, unknown>)?.code, e);
        if (!done && !chatroomConnected) {
          done = true;
          clearTimeout(chatroomTimeout);
          reject(e instanceof Error ? e : new Error("Chatroom connection error"));
        }
      }, */
      onwillreconnect: (e: unknown) => {
        const info = e as Record<string, unknown> | undefined;
        console.warn(
          "[YunxinIM] chatroom reconnecting, retry:",
          info?.retryCount,
          "duration:",
          info?.duration
        );
      },
      onmsgs: (msgs) => {
        for (const msg of msgs) {
          try {
            let eventMsg: string = "";
            const normalizedMsg = normalizeChatRoomMsg(msg);
            eventMsg = normalizedMsg.msg;
            console.log(
              "[LT:RECV] nim.msg from:",
              msg.from,
              "type:",
              msg.type,
              "msg:",
              summarizePayload(eventMsg)
            );
            suppressRemoteCommandEcho(eventMsg);
            fireNativeCall("im.onChatRoomMsg", { msg: eventMsg });
          } catch {
            // Drop silently if renderer isn't ready
          }
        }
      },
    };

    const chatroom = SDK.Chatroom.getInstance(chatroomOptions);
    chatroomInstance = chatroom;

    if (
      chatroom &&
      typeof (chatroom as unknown as { connect?: () => void }).connect ===
        "function"
    ) {
      setTimeout(() => {
        if (!chatroomConnected && currentChatroomId === chatroomId) {
          try {
            console.log("[YunxinIM] chatroom connect retry:", chatroomId);
            chatroom.connect();
          } catch (e) {
            console.warn("[YunxinIM] chatroom connect retry failed:", e);
          }
        }
      }, 1000);
    }
  });
}

// ===== Message Sending =====

export function sendChatroomText(text: string): boolean {
  if (!chatroomInstance || !chatroomConnected) {
    console.warn("[YunxinIM] sendChatroomText: chatroom not connected");
    return false;
  }

  try {
    chatroomInstance.sendText({
      text,
      done: (err: unknown) => {
        if (err) {
          console.warn("[YunxinIM] sendText error:", err);
        }
      },
      resend: false,
    });
    return true;
  } catch (e) {
    console.warn("[YunxinIM] sendText threw:", e);
    return false;
  }
}

// ===== IPC Listeners (main -> preload) =====

ipcRenderer.on(IPC.NIM_CLEANUP, () => {
  console.log("[YunxinIM] received cleanup command from main");
  destroyChatroomInstance();
  destroyIMInstance();
  resetIMState();
  loginSessionId++;
});

ipcRenderer.on(IPC.NIM_SEND_PLAY_COMMAND, (_event, text: string) => {
  console.log("[YunxinIM] received play command from main");
  sendChatroomText(text);
});

ipcRenderer.on(
  IPC.NIM_JOIN_CHATROOM,
  (_event, chatroomId: string, userId: string) => {
    console.log("[YunxinIM] received joinChatroom from main:", chatroomId);
    if (typeof chatroomId === "string" && chatroomId) {
      performLoginIM(chatroomId, userId).catch((e) => {
        console.warn("[YunxinIM] auto-join chatroom failed:", e);
      });
    }
  }
);

// ===== Address Resolution =====

function resolveAddressViaNIM(
  nim: SDK.NIM,
  chatroomId: string,
  sessionId: number,
  maxRetries = 5
): Promise<string[]> {
  return new Promise((resolve) => {
    function attempt(retryCount: number) {
      if (loginSessionId !== sessionId) {
        console.log("[YunxinIM] getChatroomAddress cancelled, session changed");
        resolve([]);
        return;
      }
      if (retryCount >= maxRetries) {
        console.warn(
          "[YunxinIM] getChatroomAddress failed after",
          maxRetries,
          "retries, proceeding with empty addresses"
        );
        resolve([]);
        return;
      }

      nim.getChatroomAddress({
        chatroomId,
        done: (err: unknown, data: { address?: string[] }) => {
          if (loginSessionId !== sessionId) {
            resolve([]);
            return;
          }
          if (err) {
            console.warn(
              "[YunxinIM] getChatroomAddress failed, retry",
              retryCount + 1,
              ":",
              err
            );
            setTimeout(() => attempt(retryCount + 1), 1000);
            return;
          }
          const resolved =
            data && Array.isArray(data.address) ? data.address : [];
          console.log(
            "[YunxinIM] getChatroomAddress resolved:",
            resolved.length,
            "addresses"
          );
          resolve(resolved);
        },
      });
    }
    attempt(0);
  });
}

let loginPromise: Promise<{ code: number; chatRoomId: string }> | null = null;

export async function performLoginIM(
  chatRoomId: string,
  userId?: string
): Promise<{ code: number; chatRoomId: string }> {
  loginSessionId++;
  const mySession = loginSessionId;

  if (loginPromise) {
    console.log(
      "[YunxinIM] loginIM superseding previous login, waiting for it to finish"
    );
    await loginPromise.catch(() => {});
    if (loginSessionId !== mySession) {
      return { code: -1, chatRoomId };
    }
  }

  loginPromise = doLoginIM(chatRoomId, userId);
  try {
    return await loginPromise;
  } finally {
    loginPromise = null;
  }
}

async function doLoginIM(
  chatRoomId: string,
  userId?: string
): Promise<{ code: number; chatRoomId: string }> {
  const currentSession = loginSessionId;
  setConnectionState("connecting");
  setChatRoomState("entering", chatRoomId);

  try {
    const tokenResult = (await ipcRenderer.invoke(
      IPC.NIM_GET_LISTEN_TOGETHER_TOKEN
    )) as {
      code: number;
      data?: {
        imToken?: string;
        imAccId?: string;
        imUid?: string;
      };
    };

    if (loginSessionId !== currentSession) {
      console.log("[YunxinIM] loginIM stale session, aborting");
      return { code: -1, chatRoomId };
    }

    if (tokenResult.code !== 200 || !tokenResult.data?.imToken) {
      console.warn("[YunxinIM] loginIM: token not available");
      return { code: -1, chatRoomId };
    }

    const account = String(
      tokenResult.data.imAccId || tokenResult.data.imUid || ""
    );
    const token = String(tokenResult.data.imToken || "");

    if (!account || !token) {
      console.warn("[YunxinIM] loginIM: account or token empty");
      return { code: -1, chatRoomId };
    }

    await initIMInstance(account, token);

    if (loginSessionId !== currentSession) {
      console.log(
        "[YunxinIM] loginIM stale session after IM connect, aborting"
      );
      return { code: -1, chatRoomId };
    }

    const addrResult = (await ipcRenderer.invoke(
      IPC.NIM_GET_CHATROOM_ADDR,
      chatRoomId,
      userId || ""
    )) as { addresses?: string[] };

    let addresses: string[] = Array.isArray(addrResult?.addresses)
      ? addrResult.addresses
      : [];
    console.log(
      "[YunxinIM] got",
      addresses.length,
      "chatroom addresses from API"
    );

    if (loginSessionId !== currentSession) {
      console.log(
        "[YunxinIM] loginIM stale session after addr fetch, aborting"
      );
      return { code: -1, chatRoomId };
    }

    if (addresses.length === 0 && nimInstance) {
      console.log(
        "[YunxinIM] no addresses from API, trying NIM SDK getChatroomAddress"
      );
      addresses = await resolveAddressViaNIM(
        nimInstance,
        chatRoomId,
        currentSession
      );
      console.log(
        "[YunxinIM] got",
        addresses.length,
        "chatroom addresses from NIM SDK"
      );
    }

    if (addresses.length === 0) {
      console.warn(
        "[YunxinIM] chatroom addresses empty after all resolution attempts, skipping chatroom init"
      );
      return { code: -1, chatRoomId };
    }

    await initChatroomInstance(chatRoomId, addresses);

    if (loginSessionId !== currentSession) {
      console.log(
        "[YunxinIM] loginIM stale session after chatroom connect, aborting"
      );
      return { code: -1, chatRoomId };
    }

    setConnectionState("connected");
    console.log("[YunxinIM] IM connected");

    setChatRoomState("entered", chatRoomId);
    console.log("[YunxinIM] chat room entered, chatRoomId:", chatRoomId);

    ipcRenderer.send(IPC.NIM_JOIN_CHATROOM, chatRoomId, userId || "");

    const result = { code: 200, chatRoomId };
    return result;
  } catch (e) {
    console.error("[YunxinIM] loginIM error:", e);
    return { code: -1, chatRoomId };
  }
}
