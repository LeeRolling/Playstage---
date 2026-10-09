/**
 * 本地服务只做两件事：把界面文件交给浏览器，把操作转给功能层。
 * 发言规则、存档和人设都在 src/domain，不写在这里。
 */

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { dispatch, toPublicLibrary } from "../domain/index.js";
import { readHardware } from "./hardware.js";
import { openStore } from "./store.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const uiDir = path.join(root, "src/ui");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const store = openStore(path.join(root, "data"));
let library = store.load();

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${host}`);
    if (url.pathname === "/api/bootstrap" && request.method === "GET") {
      const hardware = await readHardware();
      return send(response, 200, {
        library: toPublicLibrary(library),
        hardware,
        dataFile: store.file,
      });
    }
    if (url.pathname === "/api/act" && request.method === "POST") {
      const action = await readJson(request);
      const result = dispatch(library, action);
      library = result.library;
      store.save(library);
      return send(response, 200, {
        library: toPublicLibrary(library),
        message: result.message || "",
        download: result.download || null,
      });
    }
    if (url.pathname === "/api/model/test" && request.method === "POST") {
      return send(response, 200, await testModel(library.model));
    }
    if (url.pathname === "/api/health" && request.method === "GET") {
      return send(response, 200, { ok: true });
    }
    if (request.method === "GET") return sendFile(response, url.pathname);
    return send(response, 404, { message: "没有这个地址。" });
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "这件事没做成，请再试一次。";
    return send(response, 400, { message });
  }
});

server.listen(port, host, () => {
  const page = `http://${host}:${port}`;
  console.log("");
  console.log("剧戏台已在这台电脑上打开。");
  console.log(`请用浏览器访问： ${page}`);
  console.log("关掉这个窗口，剧戏台就会停止。");
  console.log("");
  openBrowser(page);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`端口 ${port} 已经被占用。先关掉另一个剧戏台窗口，再重新双击启动。`);
  } else {
    console.error("剧戏台没有启动成功。", error.message);
  }
  process.exit(1);
});

function send(response, status, body) {
  const raw = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(raw);
}

function sendFile(response, pathname) {
  const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const file = path.resolve(uiDir, requested);
  if (file !== uiDir && !file.startsWith(`${uiDir}${path.sep}`)) {
    response.writeHead(403);
    response.end("forbidden");
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("找不到页面。");
    return;
  }
  const type = types[path.extname(file)] || "application/octet-stream";
  response.writeHead(200, { "content-type": type, "cache-control": "no-store" });
  fs.createReadStream(file).pipe(response);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > 200_000) {
        reject(new Error("这次提交太长了。"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8") || "{}";
        const body = JSON.parse(text);
        if (!body.type) reject(new Error("缺少要做的事情。"));
        else resolve(body);
      } catch (error) {
        if (error instanceof SyntaxError) reject(new Error("提交的内容读不懂。"));
        else reject(error);
      }
    });
    request.on("error", () => reject(new Error("提交中断了。")));
  });
}

async function testModel(model) {
  const useCloud = model.provider === "cloud";
  const base = useCloud ? model.cloudBaseUrl : model.localBaseUrl;
  if (!base) {
    return {
      ok: false,
      message: useCloud
        ? "先填写云端地址。钥匙只留在这台电脑上。"
        : "先填写本机地址。Ollama 常见是 http://127.0.0.1:11434/v1 。安装推理软件需要你自己完成。",
    };
  }
  const url = `${base.replace(/\/$/, "")}/models`;
  const headers = {};
  if (useCloud && model.cloudApiKey) headers.authorization = `Bearer ${model.cloudApiKey}`;
  try {
    const result = await fetch(url, { headers, signal: AbortSignal.timeout(4000) });
    if (!result.ok) {
      return {
        ok: false,
        message: `地址有反应，但返回了 ${result.status}。请核对地址和模型名。若用云端，再核对钥匙。剧戏台不附带模型。`,
      };
    }
    return { ok: true, message: "连上了。这一版还不会用它来演戏，只确认路是通的。" };
  } catch {
    return {
      ok: false,
      message: "连不上。请确认本机推理软件已经打开，或云端地址和钥匙填写正确。下载和安装模型需要你自己完成。",
    };
  }
}

function openBrowser(page) {
  if (process.env.PLAYSTAGE_NO_BROWSER === "1") return;
  if (process.platform !== "win32") return;
  spawn("cmd", ["/c", "start", "", page], { detached: true, stdio: "ignore" }).unref();
}
