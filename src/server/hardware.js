import { execFile } from "node:child_process";
import { adviseFromVram } from "../domain/index.js";

export function readHardware() {
  return new Promise((resolve) => {
    execFile(
      "nvidia-smi",
      ["--query-gpu=memory.total", "--format=csv,noheader,nounits"],
      { timeout: 1500 },
      (error, stdout) => {
        if (error) {
          resolve(pack(null, "unknown"));
          return;
        }
        const first = String(stdout)
          .split(/\r?\n/)
          .map((line) => line.trim())
          .find(Boolean);
        const vramMb = Number(first);
        if (!Number.isFinite(vramMb)) {
          resolve(pack(null, "unknown"));
          return;
        }
        resolve(pack(vramMb, "nvidia-smi"));
      },
    );
  });
}

function pack(vramMb, source) {
  return {
    vramMb,
    source,
    advice: adviseFromVram(vramMb),
  };
}
