declare type CacheGroupStats = {
  entryCount: number;
  sizeBytes: number;
};

declare type AllCacheStats = {
  play: CacheGroupStats;
  http: CacheGroupStats;
  lyrics: CacheGroupStats;
  wasm: CacheGroupStats;
};

declare const orpheus: {
  platform: NodeJS.Platform;

  getWebPackCommitHash: () => Promise<string>;

  getCacheStats: () => Promise<AllCacheStats>;
  clearResources: (category: "http" | "lyrics" | "wasm") => Promise<void>;

  checkUpdate: (
    ignoreCache = false
  ) => Promise<import("../../../src/main/update").UpdateInfo | null>;

  openGpuInfo: () => Promise<void>;
};

declare const kv: {
  get: (key: string) => Promise<string | Uint8Array | null>;
  set: (key: string, value: string | Uint8Array) => Promise<void>;
  has: (key: string) => Promise<boolean>;
  delete: (key: string) => Promise<boolean>;
  clear: () => Promise<void>;

  setJson: (key: string, value: unknown) => Promise<void>;
  getJson: <T>(key: string) => Promise<T | null>;
};
