/**
 * 启动更新：对照仓库 main 上的 VERSION。
 * 只替换清单里的程序文件。data/（存档、钥匙、令牌）和清单以外的图片不动。
 * 先直连 GitHub。连不上再试公开镜像，镜像不附带令牌。
 * 直连时清单用 GitHub 返回的内容指纹核对。每条路径都再用 SHA-256 核对。对不上就不替换。
 */

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const UPDATE_REPO = "LeeRolling/Playstage---";
export const UPDATE_REF = "main";

/** 直连失败后才用，顺序不要倒过来。只拼公开的 github.com 地址，绝不附带令牌。 */
export const UPDATE_MIRROR_PREFIXES = ["https://gh-proxy.com/", "https://ghfast.top/", "https://gh.llkk.cc/"];

const ROOT_FILES = ["package.json", "VERSION", "start.bat", "start.sh", "check.bat", "install-node.bat", "README.md", "README.en.md", "LICENSE", ".gitignore"];
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
  const source = {
    repo: UPDATE_REPO,
    ref: UPDATE_REF,
    token,
    fetchImpl,
    channel: "direct",
    mirrorPrefix: "",
    usedMirror: false,
  };
  try {
    const remoteVersionBytes = await readUpdateFile(source, "VERSION");
    const remoteVersion = remoteVersionBytes.toString("utf8").trim();
    if (!isRemoteNewer(localVersion, remoteVersion)) {
      return { action: "current", tone: "ok", localVersion, remoteVersion, message: "" };
    }
    const manifestBytes = await readUpdateFile(source, "update-manifest.json");
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
      const bytes = await readUpdateFile(source, rel);
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
      message: offlineMessage(error, source),
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

function offlineMessage(error, source) {
  const status = Number(error?.status || 0);
  if (status === 401 || status === 403) {
    return "令牌不能读取这个仓库。请确认令牌仍有效，或去掉令牌直接用公开访问。这次先用现有的剧戏台打开。";
  }
  if (status === 404) {
    return "没有在仓库里找到可更新的版本，或当前访问读不到它。这次先用现有的剧戏台打开。";
  }
  if (error?.message === "fingerprint") {
    return "更新清单的指纹对不上，没有替换。这次仍用现有的剧戏台打开。";
  }
  if (error?.message === "manifest") {
    return "更新清单读不懂，没有替换。这次仍用现有的剧戏台打开。";
  }
  if (source?.usedMirror) {
    return "这次没连上更新（直连 GitHub 和镜像都试过了）。将用这台电脑上现有的剧戏台打开。存档还在。";
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

export function githubPublicFileUrl(repo, filePath, ref) {
  const encodedPath = String(filePath || "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `https://github.com/${repo}/raw/${encodeURIComponent(ref)}/${encodedPath}`;
}

export function githubMirrorFileUrl(prefix, repo, filePath, ref) {
  const base = String(prefix || "").replace(/\/?$/, "/");
  return `${base}${githubPublicFileUrl(repo, filePath, ref)}`;
}

async function readUpdateFile(source, filePath) {
  if (source.channel === "direct") {
    try {
      return await readDirectFile(source, filePath);
    } catch (error) {
      if (!canFallBackToMirror(error)) throw error;
      source.channel = "mirror";
    }
  }
  source.usedMirror = true;
  return readMirrorFile(source, filePath);
}

async function readDirectFile(source, filePath) {
  try {
    return await githubFile({
      repo: source.repo,
      filePath,
      ref: source.ref,
      token: source.token,
      fetchImpl: source.fetchImpl,
    });
  } catch (error) {
    if (!source.token || !isAuthStatus(error)) throw error;
    const bytes = await githubFile({
      repo: source.repo,
      filePath,
      ref: source.ref,
      token: "",
      fetchImpl: source.fetchImpl,
    });
    source.token = "";
    return bytes;
  }
}

async function readMirrorFile(source, filePath) {
  const prefixes = source.mirrorPrefix
    ? [source.mirrorPrefix, ...UPDATE_MIRROR_PREFIXES.filter((item) => item !== source.mirrorPrefix)]
    : [...UPDATE_MIRROR_PREFIXES];
  let lastError = Object.assign(new Error("offline"), { status: 0 });
  for (const prefix of prefixes) {
    try {
      const bytes = await fetchMirrorFile({
        prefix,
        repo: source.repo,
        filePath,
        ref: source.ref,
        fetchImpl: source.fetchImpl,
        token: source.token,
      });
      source.mirrorPrefix = prefix;
      return bytes;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function canFallBackToMirror(error) {
  if (!error || error.message === "fingerprint" || error.message === "manifest") return false;
  const status = Number(error.status || 0);
  if (status === 404) return false;
  if (!status || status === 408 || status === 429 || isAuthStatus(error) || status >= 500) return true;
  return false;
}

function isAuthStatus(error) {
  const status = Number(error?.status || 0);
  return status === 401 || status === 403;
}

async function fetchMirrorFile({ prefix, repo, filePath, ref, fetchImpl, token }) {
  const normalized = String(prefix || "").replace(/\/?$/, "/");
  if (!UPDATE_MIRROR_PREFIXES.includes(normalized)) throw Object.assign(new Error("mirror"), { status: 0 });
  const url = githubMirrorFileUrl(normalized, repo, filePath, ref);
  if (token && url.includes(token)) throw Object.assign(new Error("mirror"), { status: 0 });
  const response = await fetchImpl(url, {
    headers: {
      accept: "application/octet-stream",
      "user-agent": "playstage-updater",
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    const error = new Error(`mirror ${response.status}`);
    error.status = response.status;
    throw error;
  }
  const type = String(response.headers?.get?.("content-type") || "");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || type.includes("text/html") || looksLikeHtml(bytes)) {
    throw Object.assign(new Error("mirror html"), { status: 502 });
  }
  return bytes;
}

function looksLikeHtml(bytes) {
  const head = bytes.subarray(0, 64).toString("utf8").trim().toLowerCase();
  return head.startsWith("<!doctype") || head.startsWith("<html");
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
  const headers = {
    accept: "application/vnd.github+json",
    "user-agent": "playstage-updater",
    "x-github-api-version": "2022-11-28",
  };
  const value = String(token || "").trim();
  if (value) headers.authorization = `Bearer ${value}`;
  return headers;
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
      // 角色自己裁的表情和动作不进更新清单，更新时也不会被换掉。
      if (childRel === "assets/characters") continue;
      walkFiles(childAbs, childRel, found);
    } else if (stat.isFile()) found.push(childRel);
  }
}
