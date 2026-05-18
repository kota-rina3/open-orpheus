import os from "node:os";
import { resolve } from "node:path";

import test from "ava";

import { Database } from "../index";

const dbFile = resolve(os.tmpdir(), "open-orpheus-tmp-db.db");

test("can create database", (t) => {
  t.notThrows(() => {
    new Database(dbFile);
  });
});
