/**
 * 按当前仓库里的程序文件写出 update-manifest.json。
 * 发内测前运行：node scripts/write-update-manifest.js
 * 清单不包含 data/，也不包含它自己。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listUpdateFiles, sha256 } from "../src/server/update.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = fs.readFileSync(path.join(root, "VERSION"), "utf8").trim();
const packageVersion = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
if (packageVersion !== version) {
  console.error(`package.json 的版本是 ${packageVersion}，VERSION 是 ${version}。请先改成同一个数字。`);
  process.exit(1);
}

const files = {};
for (const rel of listUpdateFiles(root)) {
  files[rel] = sha256(fs.readFileSync(path.join(root, rel)));
}

const manifest = {
  version,
  repo: "LeeRolling/Playstage---",
  ref: "main",
  algorithm: "sha256",
  preserve: ["data/", "清单以外的 assets 文件"],
  files,
};

fs.writeFileSync(path.join(root, "update-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`清单已写好：${version}，${Object.keys(files).length} 个程序文件。data/ 不在里面。`);
