import { stat } from "node:fs/promises";
import { runProcess } from "./process-runner.js";

export class FfmpegProcessor {
  constructor({ ffmpegCommand = "ffmpeg", ffprobeCommand = "ffprobe", timeoutMs = 60 * 60 * 1000 } = {}) {
    this.ffmpegCommand = ffmpegCommand;
    this.ffprobeCommand = ffprobeCommand;
    this.timeoutMs = timeoutMs;
  }
  async process({ inputPath, videoPath, thumbnailPath }) {
    const probe = await runProcess(this.ffprobeCommand, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", inputPath]);
    const metadata = JSON.parse(probe.stdout);
    const videoStream = metadata.streams?.find((stream) => stream.codec_type === "video");
    if (!videoStream) throw new Error("The uploaded asset does not contain a video stream.");
    await runProcess(this.ffmpegCommand, ["-y", "-i", inputPath, "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-preset", "medium", "-crf", "23", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", videoPath], { timeoutMs: this.timeoutMs });
    await runProcess(this.ffmpegCommand, ["-y", "-ss", "1", "-i", inputPath, "-frames:v", "1", "-vf", "scale=1280:-2", thumbnailPath], { timeoutMs: this.timeoutMs });
    const [videoStat, thumbnailStat] = await Promise.all([stat(videoPath), stat(thumbnailPath)]);
    const durationSeconds = Number(metadata.format?.duration ?? videoStream.duration ?? 0) || null;
    return {
      metadata: { format: metadata.format?.format_name, durationSeconds, width: videoStream.width, height: videoStream.height, videoCodec: videoStream.codec_name },
      renditions: [
        { kind: "web_mp4", filePath: videoPath, mimeType: "video/mp4", sizeBytes: videoStat.size, width: videoStream.width, height: videoStream.height, durationSeconds },
        { kind: "thumbnail", filePath: thumbnailPath, mimeType: "image/jpeg", sizeBytes: thumbnailStat.size, width: 1280, height: null, durationSeconds: null }
      ]
    };
  }
}
