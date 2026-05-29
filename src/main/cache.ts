import { resolve } from "node:path";

import { KeyvSqlite } from "@keyv/sqlite";
import { Keyv } from "keyv";

import { cache } from "./folders";
import LyricCacheManager from "./cache/LyricCahceManager";
import PlayCacheManager from "./cache/PlayCacheManager";

export let lyricCacheManager: LyricCacheManager | null = null;
export let playCacheManager: PlayCacheManager | null = null;
export let httpCacheStorage: Keyv | null = null;

export default function createCacheManager() {
  lyricCacheManager = new LyricCacheManager(resolve(cache, "lyrics"));
  playCacheManager = new PlayCacheManager(resolve(cache, "play"));
  httpCacheStorage = new Keyv(
    new KeyvSqlite({
      uri: `sqlite://${resolve(cache, "http.db")}`,
      iterationLimit: 500,
      wal: true,
      driver: "node:sqlite",
    })
  );
}
