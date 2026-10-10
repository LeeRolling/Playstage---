/**
 * 内测更新：对照私有仓库 main 上的 VERSION。
 * 只替换清单里的程序文件。data/（存档、钥匙、令牌）和清单以外的图片不动。
 * 清单本身用 GitHub 返回的内容指纹核对，每个文件再用 SHA-256 核对。对不上就不替换。
 */

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const UPDATE_REPO = "LeeRolling/Playstage---";
export const UPDATE_REF = "main";

const ROOT_FILES = ["package.json", "VERSION", "start.bat", "start.sh", "README.md", ".gitignore"];
const ROOT_DIRS = ["src", "scripts", "docs", "assets"];
const BLOCKED_ROOTS = new Set(["data", "node_modules", ".git", ".update-staging"]);

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function gitBlobSha(bytes) {
  const body = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return createHash("sha1").update(`blob ${body.length}\0`).update(body).digest("hex");
}

export function parseVersion(value) {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(String(value || "").trim());
  if (!match) return [0, 0, 0];
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareVersions(local, remote) {
  const left = parseVersion(local);
  const right = parseVersion(remote);
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

export function isRemoteNewer(local, remote) {
  return compareVersions(local, remote) < 0;
}

export function safeUpdatePath(input) {
  const raw = String(input || "").replace(/\\/g, "/").trim();
  if (!raw || raw.startsWith("/") || /^[a-zA-Z]:/.test(raw)) return "";
  const parts = raw.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return "";
  if (BLOCKED_ROOTS.has(parts[0])) return "";
  return parts.join("/");
}

export function listUpdateFiles(root) {
  const found = [];
  for (const name of ROOT_FILES) {
    if (fs.existsSync(path.join(root, name)) && fs.statSync(path.join(root, name)).isFile()) found.push(name);
  }
  for (const dir of ROOT_DIRS) walkFiles(path.join(root, dir), dir, found);
  return found.sort();
}

export function readLocalVersion(root) {
  const file = path.join(root, "VERSION");
  if (!fs.existsSync(file)) return "0.0.0";
  return fs.readFileSync(file, "utf8").trim() || "0.0.0";
}

export function readGithubToken(root, env = process.env, runGh = defaultGhToken) {
  const fromEnv = ["PLAYSTAGE_GITHUB_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"]
    .map((key) => String(env[key] || "").trim())
    .find(Boolean);
  if (fromEnv) return fromEnv;
  const file = path.join(root, "data", "github-token.txt");
  if (fs.existsSync(file)) {
    const text = fs.readFileSync(file, "utf8").trim().split(/\r?\n/).find((line) => line.trim() && !line.trim().startsWith("#"));
    if (text) return text.trim();
  }
  return runGh() || "";
}

export function shouldSkipUpdate(root, env = process.env) {
  if (String(env.PLAYSTAGE_SKIP_UPDATE || "") === "1") return true;
  return fs.existsSync(path.join(root, "data", "skip-update.txt"));
}

export async function checkAndApplyUpdate({ root, env = process.env, fetchImpl = fetch, runGh = defaultGhToken } = {}) {
  const localVersion = readLocalVersion(root);
  if (shouldSkipUpdate(root, env)) {
    return {
      action: "skip",
      tone: "ok",
      localVersion,
      message: "已跳过更新检查。这次用这台电脑上现有的剧戏台打开。",
    };
  }
  const token = readGithubToken(root, env, runGh);
  if (!token) {
    return {
      action: "offline",
      tone: "bad",
      localVersion,
      message: "没有找到 GitHub 读取权限。内测需要私有仓库的只读令牌，或先在这台电脑登录 gh。这次先用现有的剧戏台打开。",
    };
  }
  try {
    const remoteVersionBytes = await githubFile({
      repo: UPDATE_REPO,
      filePath: "VERSION",
      ref: UPDATE_REF,
      token,
      fetchImpl,
    });
    const remoteVersion = remoteVersionBytes.toString("utf8").trim();
    if (!isRemoteNewer(localVersion, remoteVersion)) {
      return { action: "current", tone: "ok", localVersion, remoteVersion, message: "" };
    }
    const manifestBytes = await githubFile({
      repo: UPDATE_REPO,
      filePath: "update-manifest.json",
      ref: UPDATE_REF,
      token,
      fetchImpl,
    });
    const manifest = parseManifest(manifestBytes);
    if (manifest.version !== remoteVersion) {
      return rejected(localVersion, "清单上的版本和 VERSION 对不上，没有替换。这次仍用现有的剧戏台打开。");
    }
    if (!manifest.files.VERSION) {
      return rejected(localVersion, "清单里没有 VERSION，没有替换。这次仍用现有的剧戏台打开。");
    }
    const planned = [];
    for (const [filePath, hash] of Object.entries(manifest.files)) {
      const rel = safeUpdatePath(filePath);
      if (!rel || !/^[a-f0-9]{64}$/.test(String(hash))) {
        return rejected(localVersion, "清单里有不能替换的路径，没有更新。这次仍用现有的剧戏台打开。");
      }
      const bytes = await githubFile({ repo: UPDATE_REPO, filePath: rel, ref: UPDATE_REF, token, fetchImpl });
      if (sha256(bytes) !== hash) {
        return rejected(localVersion, "新版本有文件和清单对不上，没有替换。这次仍用现有的剧戏台打开。");
      }
      planned.push({ path: rel, bytes });
    }
    const versionFile = planned.find((item) => item.path === "VERSION");
    if (!versionFile || versionFile.bytes.toString("utf8").trim() !== remoteVersion) {
      return rejected(localVersion, "清单里的 VERSION 和远端版本不一致，没有替换。这次仍用现有的剧戏台打开。");
    }
    applyUpdateFiles(root, planned);
    fs.writeFileSync(path.join(root, "update-manifest.json"), manifestBytes);
    writeUpdateNote(root, {
      tone: "ok",
      message: `已经换成 ${remoteVersion}。存档、钥匙和你自己的图片都还在。`,
    });
    return {
      action: "restart",
      tone: "ok",
      localVersion,
      remoteVersion,
      message: `发现新版本 ${remoteVersion}，程序文件已换好。正在用新版本打开。存档和钥匙不会动。`,
    };
  } catch (error) {
    return {
      action: "offline",
      tone: "bad",
      localVersion,
      message: offlineMessage(error),
    };
  }
}

export function applyUpdateFiles(root, entries) {
  const base = path.resolve(root);
  for (const entry of entries) {
    const rel = safeUpdatePath(entry.path);
    if (!rel) throw new Error("清单里有不能替换的路径。");
    const dest = path.resolve(base, rel);
    if (dest !== base && !dest.startsWith(`${base}${path.sep}`)) throw new Error("清单里有不能替换的路径。");
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const temporary = `${dest}.new`;
    fs.writeFileSync(temporary, entry.bytes);
    fs.renameSync(temporary, dest);
  }
}

export function takeUpdateNote(root) {
  const file = path.join(root, "data", ".update-status.json");
  if (!fs.existsSync(file)) return null;
  try {
    const note = JSON.parse(fs.readFileSync(file, "utf8"));
    fs.unlinkSync(file);
    if (!note?.message) return null;
    return { message: String(note.message), tone: note.tone === "bad" ? "bad" : "ok" };
  } catch {
    try {
      fs.unlinkSync(file);
    } catch {
      // 读不到就当没有提示。
    }
    return null;
  }
}

function writeUpdateNote(root, note) {
  const dir = path.join(root, "data");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, ".update-status.json"), JSON.stringify(note));
}

function rejected(localVersion, message) {
  return { action: "rejected", tone: "bad", localVersion, message };
}

function offlineMessage(error) {
  const status = Number(error?.status || 0);
  if (status === 401 || status === 403) {
    return "令牌不能读取这个私有仓库。请确认你已被邀请为协作者，并且令牌有读取权限。这次先用现有的剧戏台打开。";
  }
  if (status === 404) {
    return "没有在私有仓库里找到可更新的版本，或当前令牌读不到它。这次先用现有的剧戏台打开。";
  }
  if (error?.message === "fingerprint") {
    return "更新清单的指纹对不上，没有替换。这次仍用现有的剧戏台打开。";
  }
  if (error?.message === "manifest") {
    return "更新清单读不懂，没有替换。这次仍用现有的剧戏台打开。";
  }
  return "这次没连上更新。将用这台电脑上现有的剧戏台打开。存档还在。";
}

function parseManifest(bytes) {
  let manifest;
  try {
    manifest = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw Object.assign(new Error("manifest"), { status: 0 });
  }
  if (!manifest || typeof manifest.files !== "object" || !manifest.version) {
    throw Object.assign(new Error("manifest"), { status: 0 });
  }
  return manifest;
}

async function githubFile({ repo, filePath, ref, token, fetchImpl }) {
  const url = `https://api.github.com/repos/${repo}/contents/${filePath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}?ref=${encodeURIComponent(ref)}`;
  const response = await fetchImpl(url, {
    headers: githubHeaders(token),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const error = new Error(`github ${response.status}`);
    error.status = response.status;
    throw error;
  }
  const payload = await response.json();
  if (payload.encoding === "base64" && payload.content) {
    const bytes = Buffer.from(String(payload.content).replace(/\s/g, ""), "base64");
    if (payload.sha && gitBlobSha(bytes) !== payload.sha) {
      const error = new Error("fingerprint");
      throw error;
    }
    return bytes;
  }
  if (payload.sha) {
    const blobUrl = `https://api.github.com/repos/${repo}/git/blobs/${payload.sha}`;
    const blob = await fetchImpl(blobUrl, {
      headers: { ...githubHeaders(token), accept: "application/vnd.github.raw" },
      signal: AbortSignal.timeout(20000),
    });
    if (!blob.ok) {
      const error = new Error(`github ${blob.status}`);
      error.status = blob.status;
      throw error;
    }
    const bytes = Buffer.from(await blob.arrayBuffer());
    if (gitBlobSha(bytes) !== payload.sha) {
      const error = new Error("fingerprint");
      throw error;
    }
    return bytes;
  }
  throw new Error("empty");
}

function githubHeaders(token) {
  return {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "user-agent": "playstage-updater",
    "x-github-api-version": "2022-11-28",
  };
}

function defaultGhToken() {
  try {
    const result = spawnSync("gh", ["auth", "token"], { encoding: "utf8", timeout: 4000 });
    if (result.status !== 0) return "";
    return String(result.stdout || "").trim();
  } catch {
    return "";
  }
}

function walkFiles(abs, rel, found) {
  if (!fs.existsSync(abs)) return;
  for (const name of fs.readdirSync(abs)) {
    if (name === ".DS_Store" || name.endsWith(".log")) continue;
    const childAbs = path.join(abs, name);
    const childRel = `${rel}/${name}`;
    const stat = fs.statSync(childAbs);
    if (stat.isDirectory()) {
      if (BLOCKED_ROOTS.has(name)) continue;
      walkFiles(childAbs, childRel, found);
    } else if (stat.isFile()) found.push(childRel);
  }
}
