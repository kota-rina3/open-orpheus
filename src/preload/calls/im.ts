import { ipcRenderer } from "electron";
import { registerCallHandler } from "../calls";
import { fireNativeCall } from "../channel";
import { imState, performLoginIM, sendChatroomText } from "../yunxin";
import { IPC } from "../../shared/listenTogetherConstants";

type ImEnterParams = {
  chat_roomid: string;
  userId?: string | number;
  user_id?: string | number;
  account?: string | number;
  [key: string]: unknown;
};

type ImSendParams = {
  msg?: unknown;
  text?: string;
  to: string;
};

const localState = {
  roomId: null as string | null,
  userId: null as string | null,
  entered: false,
};

registerCallHandler<[ImEnterParams], [Record<string, unknown>]>(
  "im.enter",
  (params) => {
    const chatRoomId = params.chat_roomid;
    localState.roomId = chatRoomId;
    localState.userId = String(
      params.userId ?? params.user_id ?? params.account ?? ""
    );
    localState.entered = true;
    imState.connected = true;
    imState.chatRoomId = chatRoomId;

    const result = { code: 200, chatRoomId };

    [
      "im.onEnter",
      "im.onConnect",
      "im.onConnected",
      "im.onChatroomEntered",
      "im.onReady",
      "im.onEnterSuccess",
    ].forEach((event, i) => {
      setTimeout(() => fireNativeCall(event, result), (i + 1) * 30);
    });

    performLoginIM(chatRoomId, localState.userId).catch((e) => {
      console.warn("[im] performLoginIM failed:", e);
    });

    return [result];
  }
);

registerCallHandler<[], [boolean]>("im.leave", () => {
  ipcRenderer.send(IPC.NIM_LEAVE_CHATROOM);
  localState.roomId = null;
  localState.userId = null;
  localState.entered = false;
  imState.connected = false;
  imState.chatRoomId = null;
  return [true];
});

registerCallHandler<[ImSendParams], [boolean]>("im.sendText", (params) => {
  const ok = sendChatroomText(params.text ?? "");
  return [ok];
});

registerCallHandler<[ImSendParams], [boolean]>("im.sendMsg", (params) => {
  const text =
    typeof params.msg === "string"
      ? params.msg
      : JSON.stringify(params.msg ?? {});
  const ok = sendChatroomText(text);
  return [ok];
});

registerCallHandler<[], [{ members: never[]; code: number }]>(
  "im.getMembers",
  () => [{ members: [], code: 200 }]
);

registerCallHandler<
  [],
  [
    {
      chatRoom: { id: string | null; name: string; announcement: string };
      code: number;
    },
  ]
>("im.getChatRoomInfo", () => [
  {
    chatRoom: { id: localState.roomId, name: "", announcement: "" },
    code: 200,
  },
]);

registerCallHandler<object[], [boolean]>("im.updateMyInfo", () => [true]);
registerCallHandler<object[], [boolean]>("im.setMemberRole", () => [true]);

registerCallHandler<[], void>("nimsys.enter", () => {
  imState.connected = true;
  ipcRenderer.emit(IPC.LT_CHATROOM_CONNECTED);
  ipcRenderer.send(IPC.LT_CHATROOM_CONNECTED);
});

registerCallHandler<[], void>("nimsys.leave", () => {
  imState.connected = false;
});
