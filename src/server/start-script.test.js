import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(new URL("../..", import.meta.url).pathname);

function readBat(name) {
  const bytes = fs.readFileSync(path.join(root, name));
  assert.equal(bytes.subarray(0, 3).toString("hex"), "efbbbf", `${name} keeps a UTF-8 BOM`);
  assert.equal(bytes.includes(Buffer.from("\r\n")), true, `${name} uses CRLF`);
  const bareLf = [...bytes].filter((byte, index) => byte === 0x0a && bytes[index - 1] !== 0x0d);
  assert.deepEqual(bareLf, [], `${name} has no bare LF`);
  const high = [...bytes.subarray(3)].filter((byte) => byte > 127);
  assert.deepEqual(high, [], `${name} is ASCII after the BOM so cmd cannot split Chinese`);
  return bytes.subarray(3).toString("ascii");
}

test("Windows 启动脚本只有 ASCII，并且会在询问后安装 Node LTS", () => {
  const start = readBat("start.bat");
  const check = readBat("check.bat");
  assert.match(start, /winget install --id OpenJS\.NodeJS\.LTS -e --accept-package-agreements --accept-source-agreements/);
  assert.match(start, /scripts\\install-node-lts\.ps1/);
  assert.match(start, /https:\/\/nodejs\.org\//);
  assert.doesNotMatch(start.toLowerCase(), /winget[^\r\n]*ollama|ollama (pull|install|run)/);
  assert.doesNotMatch(check.toLowerCase(), /winget[^\r\n]*ollama|ollama (pull|install|run)/);
  assert.match(check, /start\.bat/);

  const messages = [...start.matchAll(/call :say "([A-Za-z0-9+/=]+)"/g)].map((match) =>
    Buffer.from(match[1], "base64").toString("utf8"),
  );
  assert.ok(messages.some((line) => line.includes("还没有检测到 Node.js")));
  assert.ok(messages.some((line) => line.includes("直接回车或输入 Y")));
  assert.ok(messages.some((line) => line.includes("https://nodejs.org/")));
  assert.ok(messages.some((line) => line.includes("重新双击 start.bat")));
  assert.ok(messages.every((line) => !line.includes("\n")));
});

test("官方 MSI 安装脚本不装 Ollama，并且是 ASCII", () => {
  const file = path.join(root, "scripts/install-node-lts.ps1");
  const bytes = fs.readFileSync(file);
  assert.equal([...bytes].some((byte) => byte > 127), false);
  assert.equal(bytes.includes(Buffer.from("\r\n")), true);
  const text = bytes.toString("ascii");
  assert.match(text, /nodejs\.org\/dist/);
  assert.match(text, /SHASUMS256\.txt/);
  assert.match(text, /msiexec\.exe/);
  assert.doesNotMatch(text.toLowerCase(), /ollama (pull|install|run)|winget[^\r\n]*ollama/);
});

test("install-node.bat 按说明检查版本，再用 WinGet 交互安装", () => {
  const text = readBat("install-node.bat");
  assert.match(text, /if %MAJOR% GEQ 20 goto enough/);
  assert.match(text, /call winget install --id OpenJS\.NodeJS\.LTS --exact --source winget --interactive/);
  assert.doesNotMatch(text, /msiexec/);
  assert.doesNotMatch(text.toLowerCase(), /ollama (pull|install|run)|winget[^\r\n]*ollama/);
});

test("启动窗口会写出 VERSION 里的版本", () => {
  const start = readBat("start.bat");
  assert.match(start, /:print_version/);
  assert.match(start, /Test-Path -LiteralPath 'VERSION'/);
  assert.match(start, /5Ymn5oiP5Y\+wIA==/);
  const sh = fs.readFileSync(path.join(root, "start.sh"), "utf8");
  assert.match(sh, /剧戏台 \$\{version\}/);
  assert.match(sh, /VERSION/);
  const server = fs.readFileSync(path.join(root, "src/server/index.js"), "utf8");
  assert.match(server, /console\.log\(`剧戏台 \$\{localVersion\}`\)/);
  assert.match(server, /剧戏台 \$\{localVersion\} 已在这台电脑上打开/);
});

test("Mac 和 Linux 只提示安装 Node，不自动安装", () => {
  const text = fs.readFileSync(path.join(root, "start.sh"), "utf8");
  assert.match(text, /https:\/\/nodejs\.org\//);
  assert.doesNotMatch(text, /^\s*(brew|winget|msiexec|curl|npx)\b/m);
  assert.doesNotMatch(text.toLowerCase(), /ollama/);
  assert.doesNotMatch(text, /\n\s*brew install\b/);
});
