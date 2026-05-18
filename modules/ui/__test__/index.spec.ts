import test from "ava";

import { getSystemFonts } from "../index";

test("can get system fonts", (t) => {
  t.assert(getSystemFonts().every((v) => typeof v === "string"));
});
