import { contextBridge } from "electron";

import { exposeApi } from "../bridge/preload";
import * as kv from "../storage";

exposeApi("manage", { platform: process.platform, versions: process.versions });

contextBridge.exposeInMainWorld("kv", kv);
