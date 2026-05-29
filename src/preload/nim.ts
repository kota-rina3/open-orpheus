import { fireNativeCall } from "./channel";
import YunxinIM from "./YunxinIM";

const im = new YunxinIM();

im.addEventListener("chatroommsg", (e) => {
  const msg = (e as CustomEvent<string | undefined>).detail;
  fireNativeCall("im.onChatRoomMsg", { msg });
});

export default im;
