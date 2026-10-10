import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  applyUpdateFiles,
  checkAndApplyUpdate,
  compareVersions,
  gitBlobSha,
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

test("没有令牌或选择跳过时不下载，直接用现有的", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "playstage-update-"));
  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  fs.writeFileSync(path.join(root, "VERSION"), "0.3.0\n");
  let called = 0;
  const missing = await checkAndApplyUpdate({
    root,
    env: {},
    runGh: () => "",
    fetchImpl: async () => {
      called += 1;
      throw new Error("should not fetch");
    },
  });
  assert.equal(called, 0);
  assert.match(missing.message, /令牌/);

  fs.writeFileSync(path.join(root, "data", "skip-update.txt"), "");
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

function fakeGithub(files) {
  return async (url) => {
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
  };
}
