import { resolve } from "node:path";

import { KeyvSqlite } from "@keyv/sqlite";

import { cache } from "./folders";
import LyricCacheManager from "./cache/LyricCahceManager";
import PlayCacheManager from "./cache/PlayCacheManager";
import HttpCacheStorage from "./cache/HttpCacheStorage";

export let lyricCacheManager: LyricCacheManager | null = null;
export let playCacheManager: PlayCacheManager | null = null;
export let httpCacheStorage: HttpCacheStorage | null = null;

export default function createCacheManager() {
  lyricCacheManager = new LyricCacheManager(resolve(cache, "lyrics"));
  playCacheManager = new PlayCacheManager(resolve(cache, "play"));
  httpCacheStorage = new HttpCacheStorage(
    new KeyvSqlite({
      uri: `sqlite://${resolve(cache, "http.db")}`,
      iterationLimit: 500,
      wal: true,
      driver: "node:sqlite",
    })
  );
}
