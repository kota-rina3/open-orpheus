import { registerCallHandler } from "../calls";
import startDownload, { type DownloadTask } from "../download";
import { downloadTemp } from "../folders";
import { normalizePath } from "../util";

type DownloadStartRequest = {
  ext_header: string;
  id: string;
  md5?: string;
  md5_check_fail: number; // 0 or 1?
  mediaType: number;
  pre_path: string;
  rel_path: string;
  size: number;
  url: string;
};

// Payload of `download.onprocess`
/* type DownloadProcessPayload = {
  down: number; // Downloaded bytes
  islast: boolean; // Is the last progress update
  path: string; // Local file path
  relative: string; // Relative path from the download request
  speed: number; // Download speed in bytes/sec
  total: number; // Total bytes to download
  type: number;
}; */

const downloadTasks = new Map<string, DownloadTask>();

registerCallHandler<[DownloadStartRequest], void>(
  "download.start",
  async (event, request: DownloadStartRequest) => {
    const {
      ext_header,
      id,
      md5,
      //md5_check_fail,
      //mediaType,
      //pre_path,
      rel_path,
      size,
      url,
    } = request;

    // Parse headers from JSON string
    let headers: Record<string, string> = {};
    if (ext_header) {
      try {
        headers = JSON.parse(ext_header);
      } catch (error) {
        console.error("Failed to parse ext_header JSON:", error);
      }
    }

    // Construct destination path: tmpdir + rel_path
    const destPath = normalizePath(downloadTemp, rel_path);

    const task = await startDownload(url, destPath, {
      headers,
      md5,
      size,
    });

    task.on("progress", (e) => {
      event.sender.send("channel.call", "download.onprocess", id, {
        down: e.data.downloaded,
        islast: false,
        path: destPath,
        relative: rel_path,
        speed: e.data.speed,
        total: e.data.total || size,
        type: 0,
      });
    });

    task.on("end", (e) => {
      event.sender.send("channel.call", "download.onprocess", id, {
        down: e.data.downloaded,
        islast: true,
        path: destPath,
        relative: rel_path,
        speed: e.data.speed,
        total: e.data.total || size,
        type: 0,
      });
      downloadTasks.delete(id);
    });

    task.on("error", (e) => {
      console.error(`Download error for id ${id}:`, e.data);
      event.sender.send("channel.call", "download.onprocess", id, {
        down: 0,
        islast: true,
        path: destPath,
        relative: rel_path,
        speed: 0,
        total: size,
        type: 1,
      });
      downloadTasks.delete(id);
    });

    downloadTasks.set(id, task);
  }
);

registerCallHandler<[string], void>(
  "download.pause",
  async (event, id: string) => {
    const task = downloadTasks.get(id);
    if (task) {
      task.pause();
    }
  }
);

registerCallHandler<[string], void>(
  "download.resume",
  async (event, id: string) => {
    const task = downloadTasks.get(id);
    if (task) {
      task.resume();
    }
  }
);

registerCallHandler<[string], void>(
  "download.cancel",
  async (event, id: string) => {
    const task = downloadTasks.get(id);
    if (task) {
      await task.cancel();
      downloadTasks.delete(id);
    }
  }
);
