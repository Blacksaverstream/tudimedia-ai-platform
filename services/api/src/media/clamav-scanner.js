import { runProcess } from "./process-runner.js";

export class ClamAvScanner {
  constructor({ command = "clamdscan", timeoutMs = 10 * 60 * 1000 } = {}) {
    this.command = command;
    this.timeoutMs = timeoutMs;
  }
  async scanFile(filePath) {
    try {
      const result = await runProcess(this.command, ["--no-summary", filePath], { timeoutMs: this.timeoutMs });
      return { clean: true, output: result.stdout.trim() };
    } catch (error) {
      if (error.result?.code === 1) return { clean: false, output: error.result.stdout.trim() || error.result.stderr.trim() };
      throw error;
    }
  }
}
