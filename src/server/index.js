/**
 * 本地服务只做两件事：把界面文件交给浏览器，把操作转给功能层。
 * 发言规则、存档和人设都在 src/domain，不写在这里。
 * 图片文件的读写留在这一层：功能层只记路径。
 */

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import {
  armModelRetest,
  describePrerequisites,
  dispatch,
  LOCAL_CONNECTED_NOTE,
  localChatKeepAlive,
  recordProbe,
  resolveRouteMode,
  toPublicLibrary,
  updateModel,
} from "../domain/index.js";
import { completeChat, createLocalWarmKeeper, probeBackend, probeLocalReady } from "./chat.js";
import { resolveStoredPicture, retargetLibraryPictures, saveUploadedPicture } from "./pictures.js";
import { readHardware } from "./hardware.js";
import { replyToPlayer } from "./reply.js";
import { openStore } from "./store.js";
import { checkAndApplyUpdate, takeUpdateNote } from "./update.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const uiDir = path.join(root, "src/ui");
const assetsDir = path.join(root, "assets");
const mediaDir = path.join(root, "data/media");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const store = openStore(path.join(root, "data"));
let library = store.load();
const pictured = retargetLibraryPictures(library, root);
if (pictured.changed) {
  library = pictured.library;
  store.save(library);
}
const armed = armModelRetest(library);
if (armed !== library) {
  library = armed;
  store.save(library);
}

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

let replying = false;
let speakingId = "";
const updateNotice = takeUpdateNote(root) || { message: "", tone: "ok" };
const warmKeeper = createLocalWarmKeeper();

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${host}`);
    if (url.pathname === "/api/speaking" && request.method === "GET") {
      return send(response, 200, { speakerId: speakingId });
    }
    if (url.pathname === "/api/bootstrap" && request.method === "GET") {
      const hardware = await readHardware();
      const ollamaReachable = await probeOllama(library.model?.localBaseUrl);
      return send(response, 200, {
        library: toPublicLibrary(library),
        hardware,
        prerequisites: describePrerequisites({ ollamaReachable }),
        dataFile: store.file,
        warm: warmKeeper.snapshot(),
        update: updateNotice.message ? { message: updateNotice.message, tone: updateNotice.tone } : null,
      });
    }
    if (url.pathname === "/api/act" && request.method === "POST") {
      const action = await readJson(request);
      if (action.type === "session.send") {
        if (replying) {
          return send(response, 200, {
            library: toPublicLibrary(library),
            message: "上一句还在等回复。请稍等一下再送。",
            tone: "bad",
          });
        }
        replying = true;
        speakingId = "";
        try {
          const outcome = await replyToPlayer(
            library,
            action.text,
            async (target, messages) => {
              const keepAlive = localChatKeepAlive(library.model, target);
              const result = await completeChat(target, messages, fetch, keepAlive == null ? {} : { keepAlive });
              if (result.ok && keepAlive != null) warmKeeper.noteLocalChat(target);
              return result;
            },
            { probeLocal: probeLocalReady, onSpeaker: noteSpeaker },
          );
          library = outcome.library;
          store.save(library);
          return send(response, 200, {
            library: toPublicLibrary(library),
            message: outcome.message || "",
            tone: outcome.tone === "bad" ? "bad" : "ok",
            warm: warmKeeper.snapshot(),
          });
        } finally {
          speakingId = "";
          replying = false;
        }
      }
      const beforeModel = library.model;
      const result = dispatch(library, action);
      library = result.library;
      store.save(library);
      let message = result.message || "";
      if (action.type === "model.update") {
        const note = await warmKeeper.onModelSaved(beforeModel, library.model);
        if (note) message = message ? `${message}${note}` : note;
      }
      return send(response, 200, {
        library: toPublicLibrary(library),
        message,
        tone: "ok",
        download: result.download || null,
        warm: warmKeeper.snapshot(),
      });
    }
    if (url.pathname === "/api/model/test" && request.method === "POST") {
      const result = await testLocal(library.model);
      if (result.ok && result.models?.length === 1 && !String(library.model.localModel || "").trim()) {
        library = updateModel(library, { localModel: result.models[0] });
      }
      library = recordProbe(library, result);
      store.save(library);
      return send(response, 200, { ...result, library: toPublicLibrary(library), warm: warmKeeper.snapshot() });
    }
    if (url.pathname === "/api/model/warm" && request.method === "POST") {
      const name = String(library.model?.localModel || "").trim();
      if (!name) {
        return send(response, 200, {
          ok: false,
          message: "还没有选择本机模型，没法预热。请先读取并选中一个。剧戏台不下载模型。",
          library: toPublicLibrary(library),
          warm: warmKeeper.snapshot(),
        });
      }
      if (!library.model.localKeepWarm) {
        library = updateModel(library, { localKeepWarm: true });
        store.save(library);
      }
      const result = await warmKeeper.pin({ baseUrl: library.model.localBaseUrl, model: name });
      return send(response, 200, { ...result, library: toPublicLibrary(library), warm: warmKeeper.snapshot() });
    }
    if (url.pathname === "/api/model/unload" && request.method === "POST") {
      const name = String(library.model?.localModel || warmKeeper.snapshot().model || "").trim();
      if (!warmKeeper.snapshot().pinned && !name) {
        return send(response, 200, {
          ok: true,
          message: "本机模型现在没有留在显存里。",
          library: toPublicLibrary(library),
          warm: warmKeeper.snapshot(),
        });
      }
      const result = await warmKeeper.release("released", {
        baseUrl: library.model?.localBaseUrl,
        model: name,
      });
      return send(response, 200, { ...result, library: toPublicLibrary(library), warm: warmKeeper.snapshot() });
    }
    if (url.pathname === "/api/model/test-slot" && request.method === "POST") {
      const body = await readJson(request, { requireType: false, limit: 40_000 });
      const slot = library.model.cloudSlots?.find((item) => item.id === body.slotId);
      if (!slot) return send(response, 400, { ok: false, message: "没有这个云端接口。" });
      return send(response, 200, await testSlot(slot));
    }
    if (url.pathname === "/api/media" && request.method === "POST") {
      const body = await readJson(request, { requireType: false, limit: 8_000_000 });
      const saved = saveUploadedPicture(root, body, library);
      return send(response, 200, saved);
    }
    if (url.pathname === "/api/health" && request.method === "GET") {
      return send(response, 200, { ok: true });
    }
    if (request.method === "GET" && url.pathname.startsWith("/assets/")) {
      const requested = decodePath(url.pathname.slice("/assets/".length));
      const found = resolveStoredPicture(root, `assets/${requested}`);
      if (found) return sendRootFile(response, root, found);
      return sendRootFile(response, assetsDir, requested);
    }
    if (request.method === "GET" && url.pathname.startsWith("/media/")) {
      const requested = decodePath(url.pathname.slice("/media/".length));
      const found = resolveStoredPicture(root, `data/media/${requested}`);
      if (found) return sendRootFile(response, root, found);
      return sendRootFile(response, mediaDir, requested);
    }
    if (request.method === "GET") return sendFile(response, url.pathname);
    return send(response, 404, { message: "没有这个地址。" });
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "这件事没做成，请再试一次。";
    return send(response, 400, { message });
  }
});

boot().catch((error) => {
  console.error("剧戏台没有启动成功。", error instanceof Error ? error.message : error);
  process.exit(1);
});

async function boot() {
  if (process.env.PLAYSTAGE_UPDATE_ATTEMPT !== "1") {
    const result = await checkAndApplyUpdate({ root });
    if (result.action === "restart") {
      console.log("");
      console.log(result.message);
      console.log("");
      const child = spawn(process.execPath, process.argv.slice(1), {
        cwd: root,
        stdio: "inherit",
        env: { ...process.env, PLAYSTAGE_UPDATE_ATTEMPT: "1" },
      });
      child.on("exit", (code) => process.exit(code ?? 0));
      return;
    }
    if (result.message) {
      updateNotice.message = result.message;
      updateNotice.tone = result.tone === "bad" ? "bad" : "ok";
      console.log(result.message);
    }
  }
  await new Promise((resolve, reject) => {
    server.listen(port, host, () => resolve());
    server.once("error", reject);
  });
  const page = `http://${host}:${port}`;
  console.log("");
  console.log("剧戏台已在这台电脑上打开。");
  console.log(`请用浏览器访问： ${page}`);
  console.log("关掉这个窗口，剧戏台就会停止。");
  console.log("");
  openBrowser(page);
  const model = library.model;
  if (model?.localKeepWarm && String(model.localModel || "").trim() && resolveRouteMode(model) !== "cloud") {
    warmKeeper.pin({ baseUrl: model.localBaseUrl, model: model.localModel }).catch(() => {});
  }
  setInterval(() => {
    warmKeeper.tick(library.model).catch(() => {});
  }, 30_000);
}

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`端口 ${port} 已经被占用。先关掉另一个剧戏台窗口，再重新双击启动。`);
  } else {
    console.error("剧戏台没有启动成功。", error.message);
  }
  process.exit(1);
});

function noteSpeaker(id) {
  speakingId = String(id || "");
}

function send(response, status, body) {
  const raw = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(raw);
}

function decodePath(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function sendFile(response, pathname) {
  const requested = pathname === "/" ? "index.html" : decodeURIComponent(pathname.replace(/^\/+/, ""));
  sendRootFile(response, uiDir, requested);
}

function sendRootFile(response, baseDir, requested) {
  const file = path.resolve(baseDir, requested);
  if (file !== baseDir && !file.startsWith(`${baseDir}${path.sep}`)) {
    response.writeHead(403);
    response.end("forbidden");
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.writeHead(404, {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end("找不到这个文件。");
    return;
  }
  const type = types[path.extname(file).toLowerCase()] || "application/octet-stream";
  response.writeHead(200, { "content-type": type, "cache-control": "no-store" });
  fs.createReadStream(file).pipe(response);
}

function readJson(request, options = {}) {
  const limit = options.limit ?? 200_000;
  const requireType = options.requireType !== false;
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
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
        if (requireType && !body.type) reject(new Error("缺少要做的事情。"));
        else resolve(body);
      } catch (error) {
        if (error instanceof SyntaxError) reject(new Error("提交的内容读不懂。"));
        else reject(error);
      }
    });
    request.on("error", () => reject(new Error("提交中断了。")));
  });
}

async function testLocal(model) {
  const base = model?.localBaseUrl;
  if (!base) {
    return {
      ok: false,
      models: [],
      message: "先填写本机地址。Ollama 常见是 http://127.0.0.1:11434 ，或带 /v1 的地址。安装推理软件和模型需要你自己完成。",
    };
  }
  return probeBackend({ baseUrl: base, apiKey: "", model: model.localModel || "" }, fetch, LOCAL_CONNECTED_NOTE);
}

async function testSlot(slot) {
  if (!slot.baseUrl) {
    return { ok: false, message: "先填写这家云端的地址。钥匙只留在这台电脑上。" };
  }
  if (!slot.apiKey) {
    return { ok: false, message: `先填写${slot.label || "这家云端"}的钥匙，保存后再测试。钥匙只留在这台电脑上。` };
  }
  const label = slot.label || "这家云端";
  return probeBackend(
    { baseUrl: slot.baseUrl, apiKey: slot.apiKey, model: slot.model || "" },
    fetch,
    `${label}有回应。上台并选中它之后，就会用它来接话。剧戏台不附带模型。`,
  );
}

async function probeOllama(localBaseUrl) {
  const candidates = ["http://127.0.0.1:11434/api/tags"];
  if (localBaseUrl) candidates.push(`${String(localBaseUrl).replace(/\/$/, "")}/models`);
  for (const url of candidates) {
    try {
      const result = await fetch(url, { signal: AbortSignal.timeout(800) });
      if (result.ok) return true;
    } catch {
      // 连不上只是软提示，不挡开场。
    }
  }
  return false;
}

function openBrowser(page) {
  if (process.env.PLAYSTAGE_NO_BROWSER === "1") return;
  if (process.platform !== "win32") return;
  spawn("cmd", ["/c", "start", "", page], { detached: true, stdio: "ignore" }).unref();
}
