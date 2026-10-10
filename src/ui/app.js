const app = document.querySelector("#app");

const views = [
  ["stage", "演戏", "舞台"],
  ["world", "世界", "世界书"],
  ["cards", "人设", "人设卡"],
  ["session", "这场", "会话"],
  ["saves", "存档", "存档"],
  ["transfer", "交换", "导入导出"],
  ["model", "模型", "模型设置"],
  ["guide", "引导", "新手引导"],
];

const accents = ["#e6c98a", "#e7b3a1", "#b7c7e6", "#d5c4a1", "#c9d6b8"];

let library = null;
let hardware = null;
let dataFile = "";
let view = location.hash.replace("#", "") || "stage";
if (!views.some(([id]) => id === view)) view = "stage";
let notice = null;
let guideOpen = false;
let guideStep = 0;
let disclaimerChecked = false;
const previews = new Map();

boot();

async function boot() {
  try {
    const response = await fetch("/api/bootstrap");
    const data = await response.json();
    library = data.library;
    hardware = data.hardware;
    dataFile = data.dataFile || "";
    guideOpen = !library.guide.completed;
    render();
  } catch {
    app.textContent = "剧戏台没有打开。请确认黑色启动窗口还在，然后刷新这个页面。";
  }
}

function render() {
  if (!library) return;
  const session = library.sessions[0];
  const book = library.worldBook;
  const locationName = book.locations.find((item) => item.id === session.state.locationId)?.name || "未知地点";
  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="mark">
          <h1>剧戏台</h1>
          <p>本地演戏</p>
        </div>
        <div class="pills">
          <span class="pill">${esc(library.view.formLabel)}</span>
          <span class="pill">${esc(library.view.speakModeLabel)}</span>
          <span class="pill">${esc(locationName)}</span>
        </div>
      </header>
      <nav class="rail" aria-label="功能">
        ${views
          .map(
            ([id, short, full]) =>
              `<button type="button" data-view="${id}" aria-current="${view === id ? "page" : "false"}" title="${full}">${short}<small>${full}</small></button>`,
          )
          .join("")}
      </nav>
      <main class="stage" id="stage">
        <div class="curtain left"></div>
        <div class="curtain right"></div>
        ${view === "stage" ? stageHtml(session, book) : ledgerHtml()}
      </main>
      <aside class="side">${sideHtml(session, book)}</aside>
    </div>
    ${guideOpen ? guideModalHtml() : ""}
  `;
  bind();
  const stage = app.querySelector(".stage");
  if (stage && view === "stage") {
    const place = library.worldBook.locations.find((item) => item.id === library.sessions[0].state.locationId);
    const preview = place ? previews.get(`loc:${place.id}`) : "";
    if (preview) {
      stage.style.backgroundImage = `linear-gradient(rgba(12,8,10,0.42), rgba(12,8,10,0.55)), url("${preview}")`;
      stage.style.backgroundSize = "cover";
      stage.style.backgroundPosition = "center";
    }
  }
  const lines = app.querySelector(".lines");
  if (lines) lines.scrollTop = lines.scrollHeight;
  const field = app.querySelector("#say");
  if (field && view === "stage" && !guideOpen) field.focus();
}

function stageHtml(session, book) {
  const place = book.locations.find((item) => item.id === session.state.locationId);
  const preview = place ? previews.get(`loc:${place.id}`) : "";
  const missing = place && !place.imageFile && !preview;
  const cast = castOf(session);
  return `
    <div class="plaque"><span>当前地点</span><strong>${esc(place?.name || "未定")}</strong></div>
    ${
      missing
        ? `<div class="ribbon">这个地点还没有背景图。可以现在加上，也可以先用文字把戏演下去。<div><button type="button" data-go="world">去补一张地点图</button></div></div>`
        : place?.imageFile
          ? `<div class="ribbon">已记下背景文件「${esc(place.imageFile)}」。重新打开后需要再选一次，这一版还不会把图片收进数据目录。</div>`
          : ""
    }
    <div class="sprites">
      ${cast.map((person) => spriteHtml(person)).join("")}
    </div>
    <section class="dialog" aria-label="对话框">
      ${noticeHtml()}
      <div class="lines">
        ${session.messages
          .map(
            (line) => `
            <article class="line ${esc(line.kind)}">
              <div class="line-name" style="color:${line.kind === "system" ? "" : accent(line.speakerId)}">${esc(line.speakerName)}</div>
              <p>${esc(line.text)}</p>
            </article>`,
          )
          .join("")}
      </div>
      <form class="composer" id="say-form">
        <input id="say" name="text" type="text" maxlength="400" placeholder="写一句，送上台" autocomplete="off" />
        <button type="submit">送上台</button>
      </form>
    </section>
  `;
}

function spriteHtml(person) {
  const key = `${person.id}:fullBody`;
  const src = previews.get(key);
  const figure = src
    ? `<div class="figure"><img alt="${esc(person.name)}的立绘" src="${src}" /></div>`
    : `<div class="figure" style="--accent:${accent(person.id)}"></div>`;
  return `<div class="sprite">${figure}<b style="color:${accent(person.id)}">${esc(person.name)}</b></div>`;
}

function ledgerHtml() {
  const pages = {
    world: worldHtml,
    cards: cardsHtml,
    session: sessionHtml,
    saves: savesHtml,
    transfer: transferHtml,
    model: modelHtml,
    guide: guidePageHtml,
  };
  const draw = pages[view] || worldHtml;
  return `<section class="ledger">${noticeHtml()}${draw()}</section>`;
}

function worldHtml() {
  const book = library.worldBook;
  return `
    <h2>世界书</h2>
    <p class="help">世界书是故事的设定库。这一场戏只挂这一本。没写完的部分用副本补丁往上加，而不是再开一本。</p>
    <form id="book-form" class="block">
      <label>书名</label>
      <input name="name" type="text" value="${esc(book.name)}" />
      <label>这本书在讲什么</label>
      <textarea name="summary">${esc(book.summary)}</textarea>
      <div class="row"><button class="primary" type="submit">保存世界书</button></div>
    </form>
    <div class="grid" style="margin-top:14px">
      <div class="block">
        <h3>条目</h3>
        ${book.entries.map((entry) => `<p><b>${esc(entry.title)}</b><br>${esc(entry.body)}</p>`).join("")}
        <form id="entry-form">
          <label>新条目标题</label>
          <input name="title" type="text" />
          <label>正文</label>
          <textarea name="body"></textarea>
          <label>关键词，用逗号分开</label>
          <input name="keywords" type="text" />
          <div class="row"><button class="primary" type="submit">加一条</button></div>
        </form>
      </div>
      <div class="block">
        <h3>副本补丁</h3>
        <p class="help">补丁是同一本书的补充，不是第二本世界书。</p>
        ${book.patches
          .map(
            (patch) => `
            <p>
              <b>${esc(patch.title)}</b>
              <span class="tag">${patch.enabled ? "启用" : "停用"}</span><br>
              ${esc(patch.body)}
            </p>
            <button class="ghost" type="button" data-patch="${esc(patch.id)}">${patch.enabled ? "先停用" : "重新启用"}</button>`,
          )
          .join("")}
        <form id="patch-form">
          <label>补丁标题</label>
          <input name="title" type="text" />
          <label>补充了什么</label>
          <textarea name="body"></textarea>
          <div class="row"><button class="primary" type="submit">加上补丁</button></div>
        </form>
      </div>
      <div class="block">
        <h3>地点</h3>
        ${book.locations
          .map((place) => {
            const src = previews.get(`loc:${place.id}`);
            return `
              <div class="portrait-row">
                ${src ? `<img class="thumb" alt="" src="${src}" />` : `<div class="thumb"></div>`}
                <div>
                  <b>${esc(place.name)}</b>
                  <p class="help">${place.imageFile ? `文件名：${esc(place.imageFile)}` : "还没有背景图。"}</p>
                  <input type="file" accept="image/*" data-location-file="${esc(place.id)}" />
                </div>
              </div>`;
          })
          .join("")}
        <form id="location-form">
          <label>新地点</label>
          <input name="name" type="text" placeholder="例如：侧街的灯" />
          <div class="row"><button class="primary" type="submit">记下地点</button></div>
        </form>
      </div>
    </div>
  `;
}

function cardsHtml() {
  const players = library.characters.filter((item) => item.kind === "player");
  const npcs = library.characters.filter((item) => item.kind === "npc");
  return `
    <h2>人设卡</h2>
    <p class="help">人设卡说明「谁在台上、怎么说话」。玩家也要有一张，代表你自己。头像用来认人，全身图站在舞台上。这一版先记下文件名。</p>
    <div class="row">
      <button class="primary" type="button" data-new="player">新的玩家人设</button>
      <button class="ghost" type="button" data-new="npc">新的角色</button>
    </div>
    <h3>我（${players.length}）</h3>
    <div class="grid">${players.map(cardHtml).join("")}</div>
    <h3>台上的人（${npcs.length}）</h3>
    <div class="grid">${npcs.map(cardHtml).join("")}</div>
  `;
}

function cardHtml(person) {
  const avatar = previews.get(`${person.id}:avatar`);
  const body = previews.get(`${person.id}:fullBody`);
  return `
    <form class="card" data-card="${esc(person.id)}">
      <h3>${person.kind === "player" ? "玩家人设" : "角色"}</h3>
      <div class="portrait-row">
        ${avatar ? `<img class="thumb" alt="" src="${avatar}" />` : `<div class="thumb"></div>`}
        ${body ? `<img class="thumb" alt="" src="${body}" />` : `<div class="thumb"></div>`}
      </div>
      <label>名字</label>
      <input name="name" type="text" value="${esc(person.name)}" />
      <label>简介</label>
      <textarea name="summary">${esc(person.summary)}</textarea>
      <label>性格</label>
      <textarea name="personality">${esc(person.personality)}</textarea>
      <label>说话习惯</label>
      <input name="speechStyle" type="text" value="${esc(person.speechStyle)}" />
      <label>头像（可选）</label>
      <input type="file" accept="image/*" data-portrait="${esc(person.id)}" data-slot="avatar" />
      <p class="help">${person.avatarFile ? `已记下 ${esc(person.avatarFile)}` : "还没有头像，也可以先玩。"}</p>
      <label>全身图 / 立绘（可选）</label>
      <input type="file" accept="image/*" data-portrait="${esc(person.id)}" data-slot="fullBody" />
      <p class="help">${person.fullBodyFile ? `已记下 ${esc(person.fullBodyFile)}` : "没有全身图时，舞台上用剪影占位。"}</p>
      <div class="row">
        <button class="primary" type="submit">保存人设</button>
        <button class="danger" type="button" data-remove="${esc(person.id)}">删除</button>
      </div>
    </form>
  `;
}

function sessionHtml() {
  const session = library.sessions[0];
  const players = library.characters.filter((item) => item.kind === "player");
  const npcs = library.characters.filter((item) => item.kind === "npc");
  return `
    <h2>这场戏</h2>
    <p class="help">多于一位角色时是群聊；只留一位（或还没有）就是一对一。现在是 <b>${esc(library.view.formLabel)}</b>。</p>
    <div class="block">
      <label>玩哪一张「我」</label>
      <select id="player-pick">
        ${players.map((person) => `<option value="${esc(person.id)}" ${person.id === session.playerCardId ? "selected" : ""}>${esc(person.name)}</option>`).join("")}
      </select>
      <label>请谁上台</label>
      ${npcs
        .map(
          (person) => `
          <label class="check">
            <input type="checkbox" name="npc" value="${esc(person.id)}" ${session.npcIds.includes(person.id) ? "checked" : ""} />
            <span>${esc(person.name)}</span>
          </label>`,
        )
        .join("")}
      <div class="row"><button class="primary" type="button" id="save-cast">按这个人数开演</button></div>
    </div>
  `;
}

function savesHtml() {
  return `
    <h2>存档</h2>
    <p class="help">档存在这台电脑上，不上传。读档会回到存下去的那一句。</p>
    <p class="help">文件位置：${esc(dataFile || "软件目录里的 data 文件夹")}</p>
    <form id="save-form" class="row">
      <input name="name" type="text" placeholder="给这个档起个名字" />
      <button class="primary" type="submit">存下来</button>
    </form>
    <div class="stack" style="margin-top:14px">
      ${
        library.saves.length
          ? library.saves
              .map(
                (save) => `
              <div class="block">
                <b>${esc(save.name)}</b>
                <p class="help">${esc(save.at)}</p>
                <div class="row">
                  <button class="primary" type="button" data-load="${esc(save.id)}">读档</button>
                  <button class="danger" type="button" data-drop-save="${esc(save.id)}">删除</button>
                </div>
              </div>`,
              )
              .join("")
          : `<p class="help">还没有档。</p>`
      }
    </div>
  `;
}

function transferHtml() {
  return `
    <h2>导入导出</h2>
    <p class="help">以后可以把自己的人设、世界书或剧情包发给朋友。这一版只做出入口：导出的是占位文件，导入也只登记、不真正读进去。</p>
    <div class="callout">剧情包以后要带「前文提要」：上一位玩家做了什么、为什么走到现在。现在的导出里有一句占位提要。</div>
    <div class="row">
      <button class="ghost" type="button" data-export="world">导出世界书</button>
      <button class="ghost" type="button" data-export="characters">导出人设卡</button>
      <button class="primary" type="button" data-export="story">导出剧情包</button>
    </div>
    <form id="import-form" class="block" style="margin-top:14px">
      <label>要导入的种类</label>
      <select name="kind">
        <option value="characters">人设卡</option>
        <option value="world">世界书</option>
        <option value="story">剧情包</option>
      </select>
      <label>选择文件</label>
      <input name="file" type="file" />
      <div class="row"><button class="primary" type="submit">登记这个文件</button></div>
    </form>
    <div class="stack" style="margin-top:14px">
      ${library.transferLog
        .slice(0, 8)
        .map((item) => `<div class="block"><b>${item.direction === "export" ? "导出" : "导入"}</b><p class="help">${esc(item.message)}</p></div>`)
        .join("")}
    </div>
  `;
}

function modelHtml() {
  const model = library.model;
  return `
    <h2>模型设置</h2>
    <p class="help">剧戏台不附带模型。本机推理（推荐）或云端接口，都要你自己准备。下面的测试只检查能不能连上，还不会用它来演戏。</p>
    <div class="callout">需人工完成：安装 Ollama 或其他本机推理软件，以及下载模型。请只从官方渠道获取官方开源模型。</div>
    <form id="model-form" class="grid" style="margin-top:14px">
      <div class="block">
        <h3>本机</h3>
        <label class="check"><input type="radio" name="provider" value="local" ${model.provider !== "cloud" ? "checked" : ""} /> 优先用这台电脑</label>
        <label>本机地址</label>
        <input name="localBaseUrl" type="url" value="${esc(model.localBaseUrl)}" />
        <label>模型名（你自己装的那个）</label>
        <input name="localModel" type="text" value="${esc(model.localModel)}" placeholder="例如你在 Ollama 里看到的名字" />
      </div>
      <div class="block">
        <h3>云端（可选）</h3>
        <label class="check"><input type="radio" name="provider" value="cloud" ${model.provider === "cloud" ? "checked" : ""} /> 临时改用我自己的云端接口</label>
        <label>云端地址</label>
        <input name="cloudBaseUrl" type="url" value="${esc(model.cloudBaseUrl)}" placeholder="OpenAI 兼容地址" />
        <label>钥匙（只存在这台电脑）</label>
        <input name="cloudApiKey" type="password" value="" placeholder="${model.cloudApiKeySet ? "已保存。留空表示不改" : "可选"}" autocomplete="off" />
        <label>云端模型名</label>
        <input name="cloudModel" type="text" value="${esc(model.cloudModel)}" />
        <label class="check"><input name="clearCloudApiKey" type="checkbox" /> 清掉已保存的钥匙</label>
      </div>
      <div class="row">
        <button class="primary" type="submit">保存设置</button>
        <button class="ghost" type="button" id="test-model">测试连接</button>
      </div>
    </form>
    <h3>免责声明</h3>
    <div class="callout">${esc(library.view.disclaimer)}</div>
    <p class="help">不确定显卡能跑什么，可以看 <a href="https://www.canirun.ai/models" target="_blank" rel="noreferrer">canirun.ai</a>，或重新打开新手引导。</p>
  `;
}

function guidePageHtml() {
  const advice = hardware?.advice;
  return `
    <h2>新手引导</h2>
    <p class="help">给完全没配过模型的人。剧戏台检测显存只是为了说明方向，不会替你下载任何模型。</p>
    <div class="block">
      <h3>${esc(advice?.title || "还没读到显存")}</h3>
      <p>${esc(advice?.body || "")}</p>
      <p class="help">大约 8GB 显存，通常可以找适合这个量级的开源文本模型。大约 4GB 也有更轻的模型，但体验有限。查不到合适的也不用着急。</p>
      <p class="help">自查：<a href="https://www.canirun.ai/models" target="_blank" rel="noreferrer">https://www.canirun.ai/models</a></p>
    </div>
    <div class="callout">${esc(library.view.disclaimer)}</div>
    <div class="row">
      <button class="primary" type="button" id="reopen-guide">再看一遍引导</button>
    </div>
  `;
}

function sideHtml(session, book) {
  const place = book.locations.find((item) => item.id === session.state.locationId);
  const cast = castOf(session);
  return `
    <h2>这场</h2>
    <p>${esc(session.name)} · ${esc(library.view.formLabel)}。世界书「${esc(book.name)}」只挂这一本。</p>
    <label>地点</label>
    <select id="location-pick">
      ${book.locations.map((item) => `<option value="${esc(item.id)}" ${item.id === place?.id ? "selected" : ""}>${esc(item.name)}</option>`).join("")}
    </select>
    <h2 style="margin-top:18px">发言</h2>
    <div class="stack">
      ${["turn", "interrupt", "direct"]
        .map(
          (mode) =>
            `<button type="button" class="mode" data-mode="${mode}" aria-pressed="${session.speakMode === mode}">${mode === "turn" ? "严格轮流" : mode === "interrupt" ? "抢话" : "点谁谁回"}</button>`,
        )
        .join("")}
    </div>
    <h2 style="margin-top:18px">谁在台上</h2>
    ${cast
      .map((person) => {
        const alive = session.state.alive?.[person.id] !== false;
        return `<div class="person"><span>${esc(person.name)}</span><span>${alive ? "在台上" : "已离场"}</span></div>`;
      })
      .join("")}
    <p>缺图也可以继续。立绘和背景都留在你自己的电脑上。</p>
  `;
}

function guideModalHtml() {
  const advice = hardware?.advice;
  const pages = [
    `<h2>欢迎来到剧戏台</h2><p>这是装在你自己电脑上的演戏工具。故事、人设和存档都留在本地。软件本身不带 AI 模型。</p>`,
    `<h2>${esc(advice?.title || "看看显存")}</h2><p>${esc(advice?.body || "")}</p><p>大约 8GB 显存，通常可以找适合这个量级的开源文本模型。大约 4GB 也有更轻的模型，但体验有限。</p>`,
    `<h2>自己查一下显卡</h2><p>请打开 <a href="https://www.canirun.ai/models" target="_blank" rel="noreferrer">https://www.canirun.ai/models</a> ，按你的显卡看适合哪些模型。</p><p>如果没有合适的，也不用着急。可以改用你自己的云端接口，或先用轻一点的本地模型。剧戏台不提供、也不下载模型。</p>`,
    `<h2>开始之前</h2><div class="callout">${esc(library.view.disclaimer)}</div><label class="check"><input id="disclaimer" type="checkbox" ${disclaimerChecked ? "checked" : ""} /> 我已阅读免责声明。模型由我自己准备。</label>`,
  ];
  return `
    <div class="modal-back">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="guide-title">
        <div class="steps">第 ${guideStep + 1} / ${pages.length} 步</div>
        <div id="guide-title">${pages[guideStep]}</div>
        <div class="row">
          ${guideStep > 0 ? `<button class="ghost" type="button" id="guide-prev">上一步</button>` : ""}
          ${guideStep < pages.length - 1 ? `<button class="primary" type="button" id="guide-next">下一步</button>` : `<button class="primary" type="button" id="guide-finish">进入剧戏台</button>`}
        </div>
      </div>
    </div>
  `;
}

function noticeHtml() {
  if (!notice) return "";
  return `<p class="notice ${notice.tone === "bad" ? "bad" : ""}">${esc(notice.text)}</p>`;
}

function bind() {
  app.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      view = button.dataset.view;
      location.hash = view;
      notice = null;
      render();
    });
  });
  app.querySelectorAll("[data-go]").forEach((button) => {
    button.addEventListener("click", () => {
      view = button.dataset.go;
      location.hash = view;
      render();
    });
  });
  app.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => act({ type: "session.setMode", mode: button.dataset.mode }));
  });
  const locationPick = app.querySelector("#location-pick");
  locationPick?.addEventListener("change", () => act({ type: "session.setLocation", locationId: locationPick.value }));

  const say = app.querySelector("#say-form");
  say?.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = new FormData(say).get("text");
    act({ type: "session.send", text });
  });

  app.querySelector("#book-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    act({ type: "world.update", name: data.get("name"), summary: data.get("summary") });
  });
  app.querySelector("#entry-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    act({ type: "world.addEntry", title: data.get("title"), body: data.get("body"), keywords: data.get("keywords") });
  });
  app.querySelector("#patch-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    act({ type: "world.addPatch", title: data.get("title"), body: data.get("body") });
  });
  app.querySelectorAll("[data-patch]").forEach((button) => {
    button.addEventListener("click", () => act({ type: "world.togglePatch", patchId: button.dataset.patch }));
  });
  app.querySelector("#location-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    act({ type: "world.addLocation", name: data.get("name") });
  });
  app.querySelectorAll("[data-location-file]").forEach((input) => {
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      previews.set(`loc:${input.dataset.locationFile}`, URL.createObjectURL(file));
      act({ type: "world.setLocationImage", locationId: input.dataset.locationFile, imageFile: file.name });
    });
  });

  app.querySelectorAll("[data-new]").forEach((button) => {
    button.addEventListener("click", () => act({ type: "character.create", kind: button.dataset.new }));
  });
  app.querySelectorAll("[data-card]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      act({
        type: "character.update",
        id: form.dataset.card,
        fields: {
          name: data.get("name"),
          summary: data.get("summary"),
          personality: data.get("personality"),
          speechStyle: data.get("speechStyle"),
        },
      });
    });
  });
  app.querySelectorAll("[data-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!confirm("确定拿下这张人设？")) return;
      act({ type: "character.remove", id: button.dataset.remove });
    });
  });
  app.querySelectorAll("[data-portrait]").forEach((input) => {
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      const slot = input.dataset.slot;
      previews.set(`${input.dataset.portrait}:${slot}`, URL.createObjectURL(file));
      const fields = slot === "avatar" ? { avatarFile: file.name } : { fullBodyFile: file.name };
      act({ type: "character.update", id: input.dataset.portrait, fields });
    });
  });

  app.querySelector("#save-cast")?.addEventListener("click", async () => {
    const playerCardId = app.querySelector("#player-pick").value;
    const npcIds = [...app.querySelectorAll("input[name=npc]:checked")].map((item) => item.value);
    await act({ type: "session.setPlayer", playerCardId });
    if (library) await act({ type: "session.setNpcs", npcIds });
  });

  app.querySelector("#save-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    act({ type: "save.create", name: data.get("name") });
  });
  app.querySelectorAll("[data-load]").forEach((button) => {
    button.addEventListener("click", () => act({ type: "save.load", saveId: button.dataset.load }));
  });
  app.querySelectorAll("[data-drop-save]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!confirm("确定删除这个档？")) return;
      act({ type: "save.remove", saveId: button.dataset.dropSave });
    });
  });

  app.querySelectorAll("[data-export]").forEach((button) => {
    button.addEventListener("click", () => act({ type: "transfer.export", kind: button.dataset.export }));
  });
  app.querySelector("#import-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const file = data.get("file");
    act({
      type: "transfer.import",
      kind: data.get("kind"),
      filename: file && file.name ? file.name : "",
    });
  });

  app.querySelector("#model-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    act({
      type: "model.update",
      provider: data.get("provider"),
      localBaseUrl: data.get("localBaseUrl"),
      localModel: data.get("localModel"),
      cloudBaseUrl: data.get("cloudBaseUrl"),
      cloudModel: data.get("cloudModel"),
      cloudApiKey: data.get("cloudApiKey"),
      clearCloudApiKey: data.get("clearCloudApiKey") === "on",
    });
  });
  app.querySelector("#test-model")?.addEventListener("click", testModel);

  app.querySelector("#reopen-guide")?.addEventListener("click", () => {
    guideStep = 0;
    guideOpen = true;
    render();
  });
  app.querySelector("#guide-prev")?.addEventListener("click", () => {
    guideStep = Math.max(0, guideStep - 1);
    render();
  });
  app.querySelector("#guide-next")?.addEventListener("click", () => {
    guideStep += 1;
    render();
  });
  app.querySelector("#disclaimer")?.addEventListener("change", (event) => {
    disclaimerChecked = event.target.checked;
  });
  app.querySelector("#guide-finish")?.addEventListener("click", async () => {
    if (!disclaimerChecked) {
      notice = { tone: "bad", text: "请先勾选「我已阅读免责声明」。" };
      render();
      return;
    }
    const ok = await act({ type: "guide.complete", disclaimerAccepted: true });
    if (ok) guideOpen = false;
  });
}

async function act(action) {
  try {
    const response = await fetch("/api/act", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(action),
    });
    const data = await response.json();
    if (!response.ok) {
      notice = { tone: "bad", text: data.message || "没做成。" };
      render();
      return false;
    }
    library = data.library;
    notice = data.message ? { tone: "ok", text: data.message } : null;
    if (data.download) download(data.download);
    render();
    return true;
  } catch {
    notice = { tone: "bad", text: "和本机剧戏台失去联系了。请看启动窗口是否还在。" };
    render();
    return false;
  }
}

async function testModel() {
  notice = { tone: "ok", text: "正在试着连接…" };
  render();
  try {
    const response = await fetch("/api/model/test", { method: "POST" });
    const data = await response.json();
    notice = { tone: data.ok ? "ok" : "bad", text: data.message };
  } catch {
    notice = { tone: "bad", text: "测试没有完成。请确认启动窗口还在。" };
  }
  render();
}

function download(file) {
  const blob = new Blob([JSON.stringify(file.body, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = file.filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function castOf(session) {
  const ids = [session.playerCardId, ...session.npcIds];
  return ids.map((id) => library.characters.find((item) => item.id === id)).filter(Boolean);
}

function accent(id) {
  let total = 0;
  for (const char of String(id)) total += char.charCodeAt(0);
  return accents[total % accents.length];
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}
