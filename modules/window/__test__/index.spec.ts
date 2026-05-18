import test from "ava";

test("module can load", (t) => {
  t.notThrowsAsync(async () => {
    await import("../index");
  });
});
