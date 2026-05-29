import { KeyvSqlite } from "@keyv/sqlite";
import { Keyv, KeyvHooks } from "keyv";
import { calculateDbSize } from "../util";

export default class HttpCacheStorage extends Keyv {
  private driver: KeyvSqlite;
  private _maxSize = 0;
  private _lastSizeCheck = performance.now();

  private async checkSizeForCleanup() {
    if (!this._maxSize) return; // Limit's disabled

    const now = performance.now();
    if (now - this._lastSizeCheck < 60 * 1000) return; // Only once per minute at most
    this._lastSizeCheck = now;

    const size = await this.totalSize();
    if (size < this._maxSize) return; // No cleanup needed
  }

  constructor(driver: KeyvSqlite) {
    super(driver);

    this.driver = driver;

    this.checkSizeForCleanup = this.checkSizeForCleanup.bind(this);

    this.hooks.addHandler(KeyvHooks.POST_SET, this.checkSizeForCleanup);
  }

  async totalSize() {
    const result = await this.driver
      .query(`SELECT (page_count - freelist_count) * page_size AS valid_bytes
FROM pragma_page_count(), pragma_freelist_count(), pragma_page_size();`);
    return (result[0] as { valid_bytes: number }).valid_bytes;
  }

  async diskSize() {
    return await calculateDbSize(this.driver.db);
  }

  async entryCount() {
    let entryCount = -1;

    const iter = this.iterator?.(undefined);
    if (iter) {
      entryCount = 0;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const v of iter) {
        entryCount++;
      }
    }

    return entryCount;
  }
}
