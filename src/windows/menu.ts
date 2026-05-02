import { exposeApi } from "../bridge/preload";

exposeApi("menu", {
  wayland: process.argv.includes("--wayland"),
  submenu: process.argv.includes("--submenu"),
});
