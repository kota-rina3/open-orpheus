import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { KeyvSqlite } from "@keyv/sqlite";
import { Database } from "@open-orpheus/database";

import { data } from "./folders";
import getKeyvDriver from "./database/KeyvDriver";

const pathToWebDb = join(data, "webdb.dat");
const pathToMusicLibrary = join(data, "library.dat");
const pathToNativeDb = join(data, "openorpheus.db");

let webDb: Database;
let musicLibraryDb: Database;
let nativeDb: DatabaseSync;
let nativeDbKvDriver: KeyvSqlite;

export function initializeDatabases() {
  webDb = new Database(pathToWebDb);
  musicLibraryDb = new Database(pathToMusicLibrary);

  musicLibraryDb.executeSql(`CREATE TABLE IF NOT EXISTS track (
  file TEXT,
  tid TEXT,
  aid TEXT,
  dir TEXT,
  title TEXT,
  album TEXT,
  genre TEXT,
  artist TEXT,
  duration REAL,
  timestamp INTEGER,
  bitrate INTEGER,
  filesize INTEGER,
  ignored INTEGER DEFAULT 0,
  id TEXT,
  artistid TEXT DEFAULT "",
  parentdir TEXT DEFAULT "",
  track TEXT,
  librarypath TEXT DEFAULT "",
  tracknumber INTEGER,
  source TEXT DEFAULT "",
  starttime REAL DEFAULT 0,
  type INTEGER DEFAULT 0
)`);

  musicLibraryDb.executeSqls([
    "CREATE INDEX IF NOT EXISTS file_index      ON track (file ASC);",
    "CREATE INDEX IF NOT EXISTS dir_index       ON track (dir ASC);",
    "CREATE INDEX IF NOT EXISTS id_index        ON track (id ASC);",
    "CREATE INDEX IF NOT EXISTS parentdir_index ON track (parentdir ASC);",
  ]);

  nativeDb = new DatabaseSync(pathToNativeDb, {
    timeout: 5000,
    defensive: true,
    enableForeignKeyConstraints: true,
  });
  nativeDb.exec("PRAGMA journal_mode = WAL;");
  nativeDb.exec("PRAGMA synchronous = FULL;");

  nativeDbKvDriver = new KeyvSqlite({ driver: getKeyvDriver(nativeDb) });
}

export function getWebDb() {
  return webDb;
}

export function getMusicLibraryDb() {
  return musicLibraryDb;
}

export function getNativeDb() {
  return nativeDb;
}

export function getNativeDbKvDriver() {
  return nativeDbKvDriver;
}
