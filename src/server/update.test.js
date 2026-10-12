import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  UPDATE_MIRROR_PREFIXES,
  applyUpdateFiles,
  checkAndApplyUpdate,
  compareVersions,
  gitBlobSha,
  githubMirrorFileUrl,
  isRemoteNewer,
  listUpdateFiles,
  readLocalVersion,
  safeUpdatePath,
  sha256,
  takeUpdateNote,
} from "./update.js";

test("版本号只在远端更大时才要更新", () => {
  assert.equal(compareVersions("0.2.0", "0.3.0"), -1);
  assert.equal(compareVersions("0.3.0", "0.3.0"), 0);
  assert.equal(compareVersions("0.10.0", "0.9.1"), 1);
  assert.equal(isRemoteNewer("0.3.0", "0.3.1"), true);
  assert.equal(isRemoteNewer("0.3.1", "0.3.0"), false);
});

test("角色自己的表情和动作不进更新清单", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "playstage-list-"));
  fs.mkdirSync(path.join(root, "assets", "characters", "暖璃", "表情"), { recursive: true });
  fs.mkdirSync(path.join(root, "assets", "defaults"), { recursive: true });
  fs.writeFileSync(path.join(root, "assets", "characters", "暖璃", "表情", "expr_smile.png"), "mine");
  fs.writeFileSync(path.join(root, "assets", "defaults", "keep.txt"), "ship");
  fs.writeFileSync(path.join(root, "VERSION"), "0.3.6\n");
  const listed = listUpdateFiles(root);
  assert.equal(listed.includes("assets/characters/暖璃/表情/expr_smile.png"), false);
  assert.equal(listed.includes("assets/defaults/keep.txt"), true);
  assert.equal(listed.includes("VERSION"), true);
});

test("更新不能碰到存档、钥匙或跑出目录", () => {
  assert.equal(safeUpdatePath("src/server/update.js"), "src/server/update.js");
  assert.equal(safeUpdatePath("data/library.json"), "");
  assert.equal(safeUpdatePath("data/github-token.txt"), "");
  assert.equal(safeUpdatePath("../package.json"), "");
  assert.equal(safeUpdatePath("src/../data/library.json"), "");
  assert.equal(safeUpdatePath("/etc/passwd"), "");
  assert.equal(safeUpdatePath("node_modules/left-pad/index.js"), "");
});

test("清单和 VERSION 与当前程序文件一致，且不含 data", () => {
  const root = path.resolve(new URL("../..", import.meta.url).pathname);
  const version = fs.readFileSync(path.join(root, "VERSION"), "utf8").trim();
  const packageVersion = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
  assert.equal(packageVersion, version);
  const listed = listUpdateFiles(root);
  assert.equal(listed.some((item) => item.startsWith("data/") || item === "update-manifest.json"), false);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "update-manifest.json"), "utf8"));
  assert.equal(manifest.version, version);
  assert.equal(manifest.repo, "LeeRolling/Playstage---");
  assert.deepEqual(Object.keys(manifest.files).sort(), listed);
  for (const rel of listed) {
    assert.equal(manifest.files[rel], sha256(fs.readFileSync(path.join(root, rel))), rel);
  }
});

test("新版本对得上清单才替换，存档和额外图片留着", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "playstage-update-"));
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.mkdirSync(path.join(root, "data", "media"), { recursive: true });
  fs.mkdirSync(path.join(root, "assets", "mine"), { recursive: true });
  fs.writeFileSync(path.join(root, "VERSION"), "0.3.0\n");
  fs.writeFileSync(path.join(root, "src", "app.js"), "old");
  fs.writeFileSync(path.join(root, "data", "library.json"), '{"cloudApiKey":"secret-key"}\n');
  fs.writeFileSync(path.join(root, "data", "github-token.txt"), "token-1\n");
  fs.writeFileSync(path.join(root, "assets", "mine", "extra.png"), "custom-image");

  const versionBytes = Buffer.from("0.3.1\n");
  const appBytes = Buffer.from("new-app");
  const manifest = {
    version: "0.3.1",
    repo: "LeeRolling/Playstage---",
    ref: "main",
    algorithm: "sha256",
    files: {
      VERSION: sha256(versionBytes),
      "src/app.js": sha256(appBytes),
    },
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  const files = {
    VERSION: versionBytes,
    "update-manifest.json": manifestBytes,
    "src/app.js": appBytes,
  };

  const result = await checkAndApplyUpdate({
    root,
    env: {},
    runGh: () => "",
    fetchImpl: fakeGithub(files),
  });
  assert.equal(result.action, "restart");
  assert.match(result.message, /0\.3\.1/);
  assert.equal(fs.readFileSync(path.join(root, "src", "app.js"), "utf8"), "new-app");
  assert.equal(readLocalVersion(root), "0.3.1");
  assert.equal(fs.readFileSync(path.join(root, "data", "library.json"), "utf8"), '{"cloudApiKey":"secret-key"}\n');
  assert.equal(fs.readFileSync(path.join(root, "data", "github-token.txt"), "utf8"), "token-1\n");
  assert.equal(fs.readFileSync(path.join(root, "assets", "mine", "extra.png"), "utf8"), "custom-image");
  const note = takeUpdateNote(root);
  assert.match(note.message, /0\.3\.1/);
  assert.equal(takeUpdateNote(root), null);
});

test("清单对不上或没有网时不替换，并说明可以继续用现有的", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "playstage-update-"));
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  fs.writeFileSync(path.join(root, "VERSION"), "0.3.0\n");
  fs.writeFileSync(path.join(root, "src", "app.js"), "old");
  fs.writeFileSync(path.join(root, "data", "library.json"), '{"cloudApiKey":"secret-key"}\n');

  const bad = await checkAndApplyUpdate({
    root,
    env: { PLAYSTAGE_GITHUB_TOKEN: "token-1" },
    runGh: () => "",
    fetchImpl: async () => {
      throw new Error("offline");
    },
  });
  assert.equal(bad.action, "offline");
  assert.match(bad.message, /现有的剧戏台/);
  assert.equal(fs.readFileSync(path.join(root, "src", "app.js"), "utf8"), "old");

  const versionBytes = Buffer.from("0.4.0\n");
  const manifest = {
    version: "0.4.0",
    files: {
      VERSION: sha256(versionBytes),
      "src/app.js": sha256(Buffer.from("expected")),
      "data/library.json": sha256(Buffer.from("nope")),
    },
  };
  const files = {
    VERSION: versionBytes,
    "update-manifest.json": Buffer.from(JSON.stringify(manifest)),
    "src/app.js": Buffer.from("tampered"),
    "data/library.json": Buffer.from("nope"),
  };
  const rejected = await checkAndApplyUpdate({
    root,
    env: { PLAYSTAGE_GITHUB_TOKEN: "token-1" },
    runGh: () => "",
    fetchImpl: fakeGithub(files),
  });
  assert.equal(rejected.action, "rejected");
  assert.match(rejected.message, /没有/);
  assert.equal(fs.readFileSync(path.join(root, "src", "app.js"), "utf8"), "old");
  assert.equal(fs.readFileSync(path.join(root, "data", "library.json"), "utf8"), '{"cloudApiKey":"secret-key"}\n');
});

test("没有令牌时仍直连公开仓库；连不上再按顺序试镜像", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "playstage-update-"));
  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  fs.writeFileSync(path.join(root, "VERSION"), "0.3.0\n");
  const calls = [];
  const missing = await checkAndApplyUpdate({
    root,
    env: {},
    runGh: () => "",
    fetchImpl: async (url, options = {}) => {
      calls.push(url);
      assert.equal(options.headers?.authorization, undefined);
      throw new Error("offline");
    },
  });
  assert.equal(missing.action, "offline");
  assert.match(missing.message, /镜像都试过了/);
  assert.match(missing.message, /现有的剧戏台/);
  assert.equal(calls[0].includes("api.github.com"), true);
  UPDATE_MIRROR_PREFIXES.forEach((prefix, index) => {
    assert.equal(calls[index + 1].startsWith(prefix), true, prefix);
  });
  assert.equal(calls.length, 1 + UPDATE_MIRROR_PREFIXES.length);

  const versionBytes = Buffer.from("0.3.0\n");
  const current = await checkAndApplyUpdate({
    root,
    env: {},
    runGh: () => "",
    fetchImpl: fakeGithub({ VERSION: versionBytes }),
  });
  assert.equal(current.action, "current");

  fs.writeFileSync(path.join(root, "data", "skip-update.txt"), "");
  let called = 0;
  const skipped = await checkAndApplyUpdate({
    root,
    env: { PLAYSTAGE_GITHUB_TOKEN: "token-1" },
    runGh: () => "",
    fetchImpl: async () => {
      called += 1;
      throw new Error("should not fetch");
    },
  });
  assert.equal(called, 0);
  assert.equal(skipped.action, "skip");
  assert.match(skipped.message, /跳过/);
});

test("直连失败后用镜像下载，令牌不经过镜像，清单仍要核对", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "playstage-update-"));
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  fs.writeFileSync(path.join(root, "VERSION"), "0.3.0\n");
  fs.writeFileSync(path.join(root, "src", "app.js"), "old");
  fs.writeFileSync(path.join(root, "data", "library.json"), "keep-save");

  const versionBytes = Buffer.from("0.3.1\n");
  const appBytes = Buffer.from("new-app");
  const manifest = {
    version: "0.3.1",
    files: {
      VERSION: sha256(versionBytes),
      "src/app.js": sha256(appBytes),
    },
  };
  const files = {
    VERSION: versionBytes,
    "update-manifest.json": Buffer.from(`${JSON.stringify(manifest)}\n`),
    "src/app.js": appBytes,
  };
  const token = "super-secret-token";
  const transport = fakeMirrorTransport(files, { token, failPrefixes: [UPDATE_MIRROR_PREFIXES[0]] });
  const updated = await checkAndApplyUpdate({
    root,
    env: { PLAYSTAGE_GITHUB_TOKEN: token },
    runGh: () => "",
    fetchImpl: transport.fetchImpl,
  });
  assert.equal(updated.action, "restart");
  assert.equal(fs.readFileSync(path.join(root, "src", "app.js"), "utf8"), "new-app");
  assert.equal(fs.readFileSync(path.join(root, "data", "library.json"), "utf8"), "keep-save");
  assert.equal(transport.calls[0].url.includes("api.github.com"), true);
  assert.equal(transport.calls.filter((call) => call.url.includes("api.github.com")).length, 1);
  assert.equal(transport.calls[0].authorization, `Bearer ${token}`);
  assert.equal(transport.calls[1].url, githubMirrorFileUrl(UPDATE_MIRROR_PREFIXES[0], "LeeRolling/Playstage---", "VERSION", "main"));
  assert.equal(transport.calls[2].url.startsWith(UPDATE_MIRROR_PREFIXES[1]), true);
  assert.equal(transport.calls.some((call) => call.url.startsWith(UPDATE_MIRROR_PREFIXES[2])), false);
  for (const call of transport.calls) {
    if (!call.url.includes("api.github.com")) {
      assert.equal(call.authorization, "");
      assert.equal(call.url.includes(token), false);
    }
  }
  assert.equal(
    transport.calls.filter((call) => call.url.startsWith(UPDATE_MIRROR_PREFIXES[0])).length,
    1,
  );

  fs.writeFileSync(path.join(root, "VERSION"), "0.3.0\n");
  fs.writeFileSync(path.join(root, "src", "app.js"), "old");
  const tampered = fakeMirrorTransport(
    { ...files, "src/app.js": Buffer.from("tampered") },
    { direct: "throw" },
  );
  const rejected = await checkAndApplyUpdate({
    root,
    env: {},
    runGh: () => "",
    fetchImpl: tampered.fetchImpl,
  });
  assert.equal(rejected.action, "rejected");
  assert.match(rejected.message, /对不上/);
  assert.equal(fs.readFileSync(path.join(root, "src", "app.js"), "utf8"), "old");
});

test("令牌被拒绝时改为公开直连，不通才用镜像", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "playstage-update-"));
  fs.writeFileSync(path.join(root, "VERSION"), "0.3.0\n");
  const calls = [];
  const result = await checkAndApplyUpdate({
    root,
    env: { PLAYSTAGE_GITHUB_TOKEN: "expired-token" },
    runGh: () => "",
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, authorization: options.headers?.authorization || "" });
      if (url.includes("api.github.com") && options.headers?.authorization) {
        return { ok: false, status: 401, json: async () => ({}) };
      }
      if (url.includes("api.github.com")) return githubContents(url, { VERSION: Buffer.from("0.3.0\n") });
      throw new Error("mirror should not run");
    },
  });
  assert.equal(result.action, "current");
  assert.equal(calls.length, 2);
  assert.match(calls[0].authorization, /Bearer expired-token/);
  assert.equal(calls[1].authorization, "");
  assert.equal(calls[1].url.includes("api.github.com"), true);
});

test("仓库里没有这个文件时不改走镜像", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "playstage-update-"));
  fs.writeFileSync(path.join(root, "VERSION"), "0.3.0\n");
  const calls = [];
  const missing = await checkAndApplyUpdate({
    root,
    env: {},
    runGh: () => "",
    fetchImpl: async (url) => {
      calls.push(url);
      return { ok: false, status: 404, json: async () => ({}) };
    },
  });
  assert.equal(missing.action, "offline");
  assert.match(missing.message, /没有在仓库里找到/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].includes("api.github.com"), true);
});

test("内容指纹用 git blob", () => {
  const bytes = Buffer.from("hello\n");
  assert.equal(gitBlobSha(bytes), "ce013625030ba8dba906f756967f9e9ca394464a");
});

test("替换时拒绝写进 data", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "playstage-update-"));
  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  fs.writeFileSync(path.join(root, "data", "library.json"), "keep");
  assert.throws(() => applyUpdateFiles(root, [{ path: "data/library.json", bytes: Buffer.from("lost") }]), /不能替换/);
  assert.equal(fs.readFileSync(path.join(root, "data", "library.json"), "utf8"), "keep");
});

function fakeMirrorTransport(files, { token = "", direct = "throw", failPrefixes = [] } = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const authorization = String(options.headers?.authorization || "");
    calls.push({ url, authorization });
    if (!url.includes("api.github.com") && (authorization || (token && url.includes(token)))) {
      throw new Error("token leaked");
    }
    if (url.includes("api.github.com")) {
      if (direct === "throw") throw new Error("network");
      return githubContents(url, files);
    }
    const prefix = UPDATE_MIRROR_PREFIXES.find((item) => url.startsWith(item));
    if (!prefix) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
    if (failPrefixes.includes(prefix)) throw new Error("mirror down");
    const marker = "/raw/";
    const after = url.slice(url.indexOf(marker) + marker.length);
    const filePath = after
      .slice(after.indexOf("/") + 1)
      .split("/")
      .map((part) => decodeURIComponent(part))
      .join("/");
    const bytes = files[filePath];
    if (!bytes) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
    return {
      ok: true,
      status: 200,
      headers: { get: () => "application/octet-stream" },
      arrayBuffer: async () => Uint8Array.from(bytes).buffer,
    };
  };
  return { fetchImpl, calls };
}

function githubContents(url, files) {
  const parsed = new URL(url);
  const marker = "/contents/";
  const start = parsed.pathname.indexOf(marker);
  const filePath = decodeURIComponent(parsed.pathname.slice(start + marker.length));
  const bytes = files[filePath];
  if (!bytes) return { ok: false, status: 404, json: async () => ({}) };
  return {
    ok: true,
    status: 200,
    json: async () => ({
      encoding: "base64",
      content: Buffer.from(bytes).toString("base64"),
      sha: gitBlobSha(bytes),
    }),
  };
}

function fakeGithub(files) {
  return async (url) => githubContents(url, files);
}
