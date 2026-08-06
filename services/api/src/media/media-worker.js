import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export class MediaWorker {
  constructor({ store, objectStorage, scanner, videoProcessor, workerId }) {
    this.store = store;
    this.objectStorage = objectStorage;
    this.scanner = scanner;
    this.videoProcessor = videoProcessor;
    this.workerId = workerId;
  }
  async processNext() {
    const job = await this.store.claimNext(this.workerId);
    if (!job) return false;
    const directory = await mkdtemp(path.join(os.tmpdir(), "tudimedia-media-"));
    try {
      const asset = await this.store.getAsset(job.organizationId, job.assetId);
      if (!asset) throw new Error("The job asset no longer exists.");
      const inputPath = path.join(directory, `source${path.extname(asset.storageKey).slice(0, 12)}`);
      await this.objectStorage.downloadToFile(asset.storageKey, inputPath);
      if (job.jobType === "malware_scan") {
        const scan = await this.scanner.scanFile(inputPath);
        await this.store.completeMalwareScan({ job, clean: scan.clean, output: scan.output });
        return true;
      }
      if (job.jobType === "video_transcode") {
        const videoPath = path.join(directory, "web.mp4");
        const thumbnailPath = path.join(directory, "thumbnail.jpg");
        const result = await this.videoProcessor.process({ inputPath, videoPath, thumbnailPath });
        const renditionPaths = { web_mp4: `${asset.organizationId}/${asset.id}/renditions/web.mp4`, thumbnail: `${asset.organizationId}/${asset.id}/renditions/thumbnail.jpg` };
        for (const rendition of result.renditions) {
          rendition.storageKey = renditionPaths[rendition.kind];
          await this.objectStorage.uploadFile({ key: rendition.storageKey, filePath: rendition.filePath, mimeType: rendition.mimeType });
        }
        await this.store.completeVideo({ job, metadata: result.metadata, renditions: result.renditions.map(({ filePath: _filePath, ...item }) => item) });
        return true;
      }
      throw new Error(`Unsupported media job type: ${job.jobType}`);
    } catch (error) {
      await this.store.failJob(job, error);
      return true;
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
