import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import mime from "mime";

import type { AudioPlayInfo } from "../../preload/Player";
import client from "../request";

const CHUNK_SIZE = 2 * 1024 * 1024; // 2 MB chunk limit to prevent lock starvation

// #region Interval helpers
type Interval = [start: number, end: number]; // inclusive [start, end]

class IntervalMath {
  static merge(intervals: Interval[], added: Interval): void {
    intervals.push(added);
    intervals.sort((a, b) => a[0] - b[0]);
    let write = 0;
    for (let i = 0; i < intervals.length; i++) {
      if (write > 0 && intervals[i][0] <= intervals[write - 1][1] + 1) {
        intervals[write - 1][1] = Math.max(
          intervals[write - 1][1],
          intervals[i][1]
        );
      } else {
        intervals[write++] = intervals[i];
      }
    }
    intervals.length = write;
  }

  static remove(
    intervals: Interval[],
    [removeStart, removeEnd]: Interval
  ): void {
    const result: Interval[] = [];
    for (const [s, e] of intervals) {
      if (e < removeStart || s > removeEnd) {
        result.push([s, e]); // No overlap
      } else {
        // Overlap: carve out the removed portion
        if (s < removeStart) result.push([s, removeStart - 1]);
        if (e > removeEnd) result.push([removeEnd + 1, e]);
      }
    }
    intervals.length = 0;
    intervals.push(...result);
  }

  static missing(have: Interval[], start: number, end: number): Interval[] {
    const missing: Interval[] = [];
    let cursor = start;
    for (const [s, e] of have) {
      if (s > cursor) missing.push([cursor, Math.min(s - 1, end)]);
      cursor = Math.max(cursor, e + 1);
      if (cursor > end) break;
    }
    if (cursor <= end) missing.push([cursor, end]);
    return missing;
  }

  /** Union & Subtract: Requested - (Have + Pending) */
  static trulyMissing(
    requested: Interval,
    have: Interval[],
    pending: Interval[]
  ): Interval[] {
    const missingFromHave = this.missing(have, requested[0], requested[1]);
    const trulyMissing: Interval[] = [];
    for (const [mStart, mEnd] of missingFromHave) {
      trulyMissing.push(...this.missing(pending, mStart, mEnd));
    }
    return trulyMissing;
  }

  static downloadedBytes(intervals: Interval[]): number {
    return intervals.reduce((total, [s, e]) => total + (e - s + 1), 0);
  }
}
// #endregion

// #region Per-song buffer state
interface SongBuffer {
  songId: string;
  url: string;
  totalSize: number;
  buffer: Buffer;
  intervals: Interval[]; // Ranges fully downloaded and written to RAM
  pendingIntervals: Interval[]; // Lock Array: Ranges currently being fetched by an active HTTP request
  backgroundFetchInProgress: boolean;
  contentType: string;
}

interface ChunkWrittenDetail {
  start: number;
  end: number;
}
// #endregion

export default class AudioStreamer extends EventTarget {
  private songBuffer: SongBuffer | null = null;
  private currentAudioPlayInfo: AudioPlayInfo | null = null;

  get buffer() {
    return this.songBuffer;
  }

  get audioPlayInfo() {
    return this.currentAudioPlayInfo;
  }

  constructor() {
    super();
  }

  setPlayInfo(playInfo: AudioPlayInfo | null): void {
    this.currentAudioPlayInfo = playInfo;
  }

  private onProgress(progress: number): void {
    this.dispatchEvent(
      new CustomEvent<number>("progress", { detail: progress })
    );
  }

  private onComplete(): void {
    if (!this.songBuffer || !this.currentAudioPlayInfo) return;
    this.dispatchEvent(new Event("complete"));
  }

  private parseSizeFromHeaders(headers: IncomingHttpHeaders): {
    totalSize: number;
    contentType: string;
  } {
    const getHeader = (v: string | string[] | undefined) =>
      Array.isArray(v) ? v[0] : v;

    const contentType = getHeader(headers["content-type"]) ?? "audio/mpeg";
    const cr = getHeader(headers["content-range"]);
    if (cr) {
      const match = cr.match(/\/(\d+)/);
      if (match) return { totalSize: Number(match[1]), contentType };
    }
    const cl = getHeader(headers["content-length"]);
    return { totalSize: cl ? Number(cl) : 0, contentType };
  }

  private async openRangeStream(
    url: string,
    start: number,
    end?: number
  ): Promise<{
    stream: Readable;
    headers: IncomingHttpHeaders;
    actualStart: number;
  }> {
    const rangeValue =
      end !== undefined ? `bytes=${start}-${end}` : `bytes=${start}-`;

    const stream = client.stream(url, {
      headers: { Range: rangeValue },
      throwHttpErrors: false,
    }) as unknown as Readable;

    const response = await new Promise<IncomingMessage>((resolve, reject) => {
      stream.once("response", (res: IncomingMessage) => resolve(res));
      stream.once("error", reject);
    });

    if (response.statusCode && response.statusCode >= 400) {
      stream.destroy();
      throw new Error(`Upstream HTTP Error: ${response.statusCode}`);
    }

    let actualStart = start;
    if (response.statusCode === 206) {
      const cr = response.headers["content-range"];
      if (typeof cr === "string") {
        const match = cr.match(/bytes\s+(\d+)-/i);
        if (match) actualStart = Number(match[1]);
      }
    } else if (response.statusCode === 200) {
      actualStart = 0;
    }

    return { stream, headers: response.headers, actualStart };
  }

  private ensureSongBuffer(
    songId: string,
    url: string,
    totalSize: number,
    contentType: string
  ): SongBuffer {
    if (this.songBuffer?.songId === songId) return this.songBuffer;

    this.songBuffer = {
      songId,
      url,
      totalSize,
      buffer: Buffer.alloc(totalSize),
      intervals: [],
      pendingIntervals: [],
      backgroundFetchInProgress: false,
      contentType,
    };
    return this.songBuffer;
  }

  /**
   * PRODUCER: Fetches a capped chunk from remote, writes to Buffer, updates Locks, and broadcasts events.
   */
  private async fetchAndCache(
    sb: SongBuffer,
    start: number,
    end: number,
    preOpenedStream?: { stream: Readable; actualStart: number }
  ): Promise<void> {
    // 1. Acquire the lock for this specific chunk
    IntervalMath.merge(sb.pendingIntervals, [start, end]);

    try {
      const { stream, actualStart } =
        preOpenedStream ?? (await this.openRangeStream(sb.url, start, end));
      let offset = actualStart;

      for await (const value of stream) {
        if (this.songBuffer !== sb) {
          stream.destroy();
          return;
        }

        const chunk = Buffer.isBuffer(value)
          ? value
          : Buffer.from(value as Uint8Array);
        if (offset >= sb.totalSize) break;

        const writableLength = Math.min(chunk.length, sb.totalSize - offset);
        if (writableLength <= 0) break;

        // Write directly to the persistent RAM cache
        chunk.copy(sb.buffer, offset, 0, writableLength);

        const chunkStart = offset;
        const chunkEnd = offset + writableLength - 1;

        // 2. Mark bytes as successfully acquired
        IntervalMath.merge(sb.intervals, [chunkStart, chunkEnd]);
        offset += writableLength;

        // 3. Broadcast to sleeping consumers
        this.dispatchEvent(
          new CustomEvent<ChunkWrittenDetail>("chunk-written", {
            detail: { start: chunkStart, end: chunkEnd },
          })
        );

        this.onProgress(
          IntervalMath.downloadedBytes(sb.intervals) / sb.totalSize
        );

        // 4. Chunk Limit Break: Prevent massive locks by stopping the download exactly when the chunk ends.
        if (offset > end) {
          stream.destroy();
          break;
        }
      }

      if (IntervalMath.downloadedBytes(sb.intervals) >= sb.totalSize) {
        this.onComplete();
      }
    } catch (e) {
      // Dispatch error so sleeping consumers wake up and retry
      this.dispatchEvent(new Event("chunk-error"));
      console.error("Error when downloading the audio chunk:", e);
    } finally {
      // 5. Release Lock: Cleanup bounds (written bytes are already safely in sb.intervals)
      IntervalMath.remove(sb.pendingIntervals, [start, end]);
    }
  }

  /**
   * CONSUMER: A Web ReadableStream that perfectly feeds the browser requests.
   * Reads from RAM, dynamically fetching the next 2MB chunk if missing.
   */
  private createConsumerStream(
    sb: SongBuffer,
    start: number,
    end: number
  ): ReadableStream<Uint8Array> {
    let cursor = start;
    const abortController = new AbortController();

    return new ReadableStream<Uint8Array>({
      start: async (controller) => {
        try {
          while (cursor <= end) {
            if (this.songBuffer !== sb) throw new Error("Song changed");

            // 1. Check if the byte at `cursor` is already available in RAM
            let availableEnd = -1;
            for (const [s, e] of sb.intervals) {
              if (cursor >= s && cursor <= e) {
                availableEnd = e;
                break;
              }
            }

            if (availableEnd !== -1) {
              // WE HAVE DATA: Zero-copy slice directly from the internal ArrayBuffer
              const chunkEnd = Math.min(availableEnd, end);
              const slice = new Uint8Array(
                sb.buffer.buffer,
                sb.buffer.byteOffset + cursor,
                chunkEnd - cursor + 1
              );
              controller.enqueue(slice);
              cursor = chunkEnd + 1;
            } else {
              // MISSING DATA: Ensure a Producer is actively fetching it
              const isPending = sb.pendingIntervals.some(
                ([s, e]) => cursor >= s && cursor <= e
              );

              // Pull Mechanism: If no producer is working on this byte, spawn one for the next chunk
              if (!isPending) {
                const trulyMissing = IntervalMath.trulyMissing(
                  [cursor, end],
                  sb.intervals,
                  sb.pendingIntervals
                );
                if (trulyMissing.length > 0) {
                  const [mStart, mEnd] = trulyMissing[0];
                  const chunkEnd = Math.min(mEnd, mStart + CHUNK_SIZE - 1);
                  void this.fetchAndCache(sb, mStart, chunkEnd);
                }
              }

              // Sleep until a Producer broadcasts a chunk
              await new Promise<void>((resolve, reject) => {
                const onWakeup = () => {
                  cleanup();
                  resolve();
                };

                const onAbort = () => {
                  cleanup();
                  reject(new Error("Stream cancelled by browser"));
                };

                const cleanup = () => {
                  this.removeEventListener("chunk-written", onWakeup);
                  this.removeEventListener("chunk-error", onWakeup);
                  abortController.signal.removeEventListener("abort", onAbort);
                };

                this.addEventListener("chunk-written", onWakeup);
                this.addEventListener("chunk-error", onWakeup);
                abortController.signal.addEventListener("abort", onAbort);
              });
            }
          }
          controller.close();
        } catch (e) {
          try {
            controller.error(e);
          } catch {
            /* Browser abruptly closed connection */
          }
        }
      },
      cancel() {
        // Triggered immediately when browser aborts a request (e.g., user seeks)
        abortController.abort();
      },
    });
  }

  private backgroundFetchFull(sb: SongBuffer): void {
    if (sb.backgroundFetchInProgress) return;
    sb.backgroundFetchInProgress = true;

    void (async () => {
      try {
        while (this.songBuffer === sb) {
          // Look for gaps anywhere in the file that are NOT currently locked
          const trulyMissing = IntervalMath.trulyMissing(
            [0, sb.totalSize - 1],
            sb.intervals,
            sb.pendingIntervals
          );
          if (trulyMissing.length === 0) break;

          // Aggressively fetch the next missing piece, capped at CHUNK_SIZE
          const [mStart, mEnd] = trulyMissing[0];
          const chunkEnd = Math.min(mEnd, mStart + CHUNK_SIZE - 1);
          await this.fetchAndCache(sb, mStart, chunkEnd);
        }
      } catch {
        // Suppress background errors. Will gracefully resume later.
      } finally {
        if (this.songBuffer === sb) sb.backgroundFetchInProgress = false;
      }
    })();
  }

  async handleRequest(songId: string, request: Request): Promise<Response> {
    if (
      !this.currentAudioPlayInfo ||
      this.currentAudioPlayInfo.songId !== songId
    ) {
      return new Response("No audio play info available for this song", {
        status: 404,
      });
    }

    if (this.currentAudioPlayInfo.type !== 4) {
      // Native Node Streaming Fallback for Local Files
      const fileStat = await stat(this.currentAudioPlayInfo.path);
      const nodeStream = createReadStream(this.currentAudioPlayInfo.path);

      const webStream = new ReadableStream({
        start(controller) {
          nodeStream.on("data", (chunk) => controller.enqueue(chunk));
          nodeStream.on("end", () => controller.close());
          nodeStream.on("error", (err) => controller.error(err));
        },
        cancel() {
          nodeStream.destroy();
        },
      });

      this.onProgress(1);
      this.onComplete();

      return new Response(webStream, {
        status: 200,
        headers: {
          "Content-Type":
            mime.getType(this.currentAudioPlayInfo.path) ||
            "application/octet-stream",
          "Content-Length": String(fileStat.size),
        },
      });
    }

    const url = this.currentAudioPlayInfo.musicurl;
    const rangeHeader = request.headers.get("range");

    let start = 0;
    let end: number | undefined;

    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (!match) return new Response("Invalid range", { status: 416 });
      start = Number(match[1]);
      end = match[2] ? Number(match[2]) : undefined;
    }

    let sb = this.songBuffer;
    let initialStreamData: { stream: Readable; actualStart: number } | null =
      null;

    if (!sb || sb.songId !== songId) {
      try {
        // Fetch metadata to initialize the Buffer
        const { stream, headers, actualStart } = await this.openRangeStream(
          url,
          start,
          end
        );
        const info = this.parseSizeFromHeaders(headers);

        if (!info.totalSize)
          return new Response("Could not determine file size", { status: 502 });

        sb = this.ensureSongBuffer(
          songId,
          url,
          info.totalSize,
          info.contentType
        );
        initialStreamData = { stream, actualStart }; // Kept to save a round-trip
      } catch {
        return new Response("Upstream stream initialization error", {
          status: 502,
        });
      }
    }

    const resolvedEnd = Math.min(end ?? sb.totalSize - 1, sb.totalSize - 1);

    if (start >= sb.totalSize || start > resolvedEnd) {
      return new Response("Range not satisfiable", {
        status: 416,
        headers: { "Content-Range": `bytes */${sb.totalSize}` },
      });
    }

    // 1. Calculate strictly the bytes we need to fetch from the Network
    const trulyMissing = IntervalMath.trulyMissing(
      [start, resolvedEnd],
      sb.intervals,
      sb.pendingIntervals
    );

    // 2. Spawn Network Producers for missing bytes, capped by CHUNK_SIZE
    for (const [mStart, mEnd] of trulyMissing) {
      const chunkEnd = Math.min(mEnd, mStart + CHUNK_SIZE - 1);

      if (initialStreamData && mStart === start) {
        // Reuse the already-open HTTP connection
        void this.fetchAndCache(sb, mStart, chunkEnd, initialStreamData);
        initialStreamData = null;
      } else {
        void this.fetchAndCache(sb, mStart, chunkEnd);
      }
    }

    // 3. Clean up leftover initial stream if it wasn't strictly needed for a missing gap
    if (initialStreamData) {
      initialStreamData.stream.destroy();
    }

    // 4. Fire up background preloading
    if (rangeHeader) {
      this.backgroundFetchFull(sb);
    }

    // 5. Connect the Event-Driven Consumer Web Stream to Response
    return new Response(this.createConsumerStream(sb, start, resolvedEnd), {
      status: rangeHeader ? 206 : 200,
      headers: {
        "Content-Type": sb.contentType,
        "Content-Length": String(resolvedEnd - start + 1),
        ...(rangeHeader && {
          "Content-Range": `bytes ${start}-${resolvedEnd}/${sb.totalSize}`,
        }),
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
      },
    });
  }
}
