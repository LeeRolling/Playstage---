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

const accents = ["#e6c98a", "#e7b3a1", "#b7c7e6", "#d5c4a1", "#c9d6b8", "#e6d0b0"];

let library = null;
let hardware = null;
let prerequisites = null;
let dataFile = "";
let view = location.hash.replace("#", "") || "stage";
if (!views.some(([id]) => id === view)) view = "stage";
let notice = null;
let guideOpen = false;
let guideStep = 0;
let disclaimerChecked = false;
let forcePicker = false;
let pickerIntent = "";
let bookFocus = "";
let paintedView = null;
let toastTimer = 0;
const previews = new Map();
const sceneCache = new Map();

boot();

async function boot() {
  try {
    const response = await fetch("/api/bootstrap");
    const data = await response.json();
    library = data.library;
    hardware = data.hardware;
    prerequisites = data.prerequisites;
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
  const scene = library.view.scene;
  const sceneUrl = mediaUrl(scene.imageFile);
  const sceneOk = Boolean(sceneUrl) && sceneCache.get(sceneUrl) === "ok" && view === "stage";
  rememberScene(sceneUrl);
  const keepScroll = paintedView === view;
  const ledgerScroll = keepScroll ? app.querySelector(".ledger")?.scrollTop || 0 : 0;
  const sideScroll = keepScroll ? app.querySelector(".side")?.scrollTop || 0 : 0;
  const windowScroll = keepScroll ? window.scrollY : 0;
  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="mark">
          <h1>剧戏台</h1>
          <p>本地演戏</p>
        </div>
        <div class="pills">
          <span class="pill">${esc(scene.stageName || "未选舞台")}</span>
          <span class="pill">${esc(library.view.formLabel)}</span>
          <span class="pill">${esc(library.view.speakModeLabel)}</span>
          <span class="pill">${esc(scene.locationName)}${scene.timeOfDay === "night" ? " · 夜晚" : ""}</span>
          ${library.model.remindRetest ? `<span class="pill">请再测模型</span>` : ""}
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
      <main class="stage${sceneOk ? " has-scene" : ""}" id="stage" ${sceneOk ? `style="background-image:linear-gradient(rgba(12,8,10,0.28), rgba(12,8,10,0.5)), url('${esc(sceneUrl)}')"` : ""}>
        ${sceneOk ? "" : `<div class="curtain left"></div><div class="curtain right"></div>`}
        ${view === "stage" ? stageHtml(session, scene, sceneUrl) : ledgerHtml()}
      </main>
      <aside class="side">${sideHtml(session)}</aside>
    </div>
    ${toastHtml()}
    ${guideOpen ? guideModalHtml() : ""}
    ${!guideOpen && (!library.stagePicked || forcePicker) ? stagePickerHtml() : ""}
  `;
  bind();
  settleSprites();
  paintedView = view;
  const ledger = app.querySelector(".ledger");
  const side = app.querySelector(".side");
  if (keepScroll && ledger) ledger.scrollTop = ledgerScroll;
  if (keepScroll && side) side.scrollTop = sideScroll;
  if (keepScroll) window.scrollTo(0, windowScroll);
  if (keepScroll) {
    requestAnimationFrame(() => {
      if (ledger?.isConnected) ledger.scrollTop = ledgerScroll;
      if (side?.isConnected) side.scrollTop = sideScroll;
      window.scrollTo(0, windowScroll);
    });
  }
  const lines = app.querySelector(".lines");
  if (lines) lines.scrollTop = lines.scrollHeight;
  const field = app.querySelector("#say");
  if (field && view === "stage" && !guideOpen && library.stagePicked && !forcePicker) field.focus({ preventScroll: true });
  armToast();
}

function stageHtml(session, scene, sceneUrl) {
  const missingFile = scene.backgroundSet && sceneUrl && sceneCache.get(sceneUrl) === "missing";
  const cast = castOf(session);
  const speaker = currentSpeaker(session);
  return `
    <div class="plaque"><span>${esc(scene.stageName || "选择舞台")}</span><strong>${esc(scene.locationName)}</strong></div>
    ${ribbonHtml(scene, missingFile)}
    <div class="sprites">
      ${cast
        .filter((person) => person.kind !== "player")
        .map((person) => spriteHtml(person, speaker))
        .join("")}
    </div>
    <section class="dialog" aria-label="对话框">
      <div class="dialog-portrait">
        ${
          speaker.src
            ? `<img alt="${esc(speaker.name)}的头像" src="${esc(speaker.src)}" />`
            : `<div class="portrait-fallback" style="--accent:${accent(speaker.id || "system")}"></div>`
        }
        <b>${esc(speaker.name)}</b>
      </div>
      <div class="dialog-main">
        ${library.model.remindRetest ? `<p class="notice">上次打开时模型曾经测过。这次请到「模型」再测一次连接。</p>` : ""}
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
          <input id="say" name="text" type="text" maxlength="400" placeholder="${library.stagePicked ? "写一句，送上台" : "先选一座舞台"}" autocomplete="off" ${library.stagePicked ? "" : "disabled"} />
          <button type="submit" ${library.stagePicked ? "" : "disabled"}>送上台</button>
        </form>
      </div>
    </section>
  `;
}

function ribbonHtml(scene, missingFile) {
  if (!library.stagePicked) {
    return `<div class="ribbon">先选一座舞台。霜印王国、青玄界、霓穹市各有三位，不会挤在同一场里。</div>`;
  }
  if (scene.triggerStub) {
    return `<div class="ribbon">特殊情景「${esc(scene.triggerName)}」被提到了。这张图还没放进来，先用当前地点的背景。<div><button type="button" data-go="world">去配这张情景图</button></div></div>`;
  }
  if (missingFile) {
    return `<div class="ribbon">背景路径已经写上，这台电脑的文件夹里还没有这张图。把图片放到说明里的位置，或在世界书里另选一张。没有图也可以先演戏。</div>`;
  }
  if (!scene.backgroundSet) {
    return `<div class="ribbon">这个地点还没有背景图。可以现在加上，也可以先用文字把戏演下去。<div><button type="button" data-go="world">去补一张地点图</button></div></div>`;
  }
  return "";
}

function spriteHtml(person, speaker) {
  const src = pictureUrl(person, "fullBody");
  const someoneSpeaking = Boolean(speaker?.id) && speaker.id !== "system";
  const quiet = someoneSpeaking && person.id !== speaker.id;
  const image = src ? `<img alt="${esc(person.name)}的立绘" src="${esc(src)}" />` : "";
  return `<div class="sprite ${quiet ? "is-quiet" : "is-speaking"}"><div class="figure" style="--accent:${accent(person.id)}">${image}</div></div>`;
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
  return `<section class="ledger">${draw()}</section>`;
}

function worldHtml() {
  const book = focusedBook();
  const stage = library.stages.find((item) => item.id === book?.stageId);
  return `
    <h2>世界书</h2>
    <p class="help">库里有三座舞台，各一本世界书。这一场戏只挂其中一本。没写完的部分用副本补丁往上加。</p>
    <div class="row">
      <label for="book-focus">正在看</label>
      <select id="book-focus">
        ${library.worldBooks
          .map(
            (item) =>
              `<option value="${esc(item.id)}" ${item.id === book?.id ? "selected" : ""}>${esc(item.name)}${item.id === library.sessions[0].worldBookId ? " · 这场" : ""}</option>`,
          )
          .join("")}
      </select>
      <button class="ghost" type="button" data-open-picker>换一座舞台</button>
    </div>
    ${
      book
        ? `<form id="book-form" class="block">
            <p class="help">${esc(stage?.tone || "")} · ${stage ? stage.characterIds.map((id) => nameOf(id)).join("、") : ""}</p>
            <label>书名</label>
            <input name="name" type="text" value="${esc(book.name)}" />
            <label>这本书在讲什么</label>
            <textarea name="summary">${esc(book.summary)}</textarea>
            <div class="row"><button class="primary" type="submit">保存这本世界书</button></div>
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
              <p class="help">白天的图跟着地点走。夜晚用同一文件夹里带「_晚上」的那张。提到地点名字时，背景会换。</p>
              ${book.locations.map((place) => locationCard(place)).join("")}
              <form id="location-form">
                <label>新地点</label>
                <input name="name" type="text" placeholder="例如：冰河渡口" />
                <div class="row"><button class="primary" type="submit">记下地点</button></div>
              </form>
              <form id="trigger-form">
                <h3>特殊情景</h3>
                <p class="help">某个词出现时可以换一张专门的图。还没配图也没关系，先沿用地点背景。</p>
                <label>挂在哪个地点</label>
                <select name="locationId">
                  ${book.locations.map((place) => `<option value="${esc(place.id)}">${esc(place.name)}</option>`).join("")}
                </select>
                <label>情景名</label>
                <input name="name" type="text" placeholder="例如：炉火前的誓言" />
                <label>触发词，用逗号分开</label>
                <input name="keywords" type="text" />
                <div class="row"><button class="primary" type="submit">记下情景</button></div>
              </form>
            </div>
          </div>`
        : ""
    }
  `;
}

function locationCard(place) {
  const day = pictureOfLocation(place, "day");
  const night = pictureOfLocation(place, "night");
  const triggers = (place.triggers || [])
    .map(
      (item) => `
        <p class="help">情景「${esc(item.name)}」：${item.keywords.map((word) => esc(word)).join("、") || "还没有触发词"}。${item.imageFile ? "已有专图。" : "专图还是空的。"}</p>
        <label>给「${esc(item.name)}」配图（可选）</label>
        <input type="file" accept="image/*" data-crop="trigger" data-location-id="${esc(place.id)}" data-trigger-id="${esc(item.id)}" />`,
    )
    .join("");
  return `
    <div class="portrait-row">
      ${day ? `<img class="thumb wide" alt="" src="${esc(day)}" />` : `<div class="thumb wide"></div>`}
      ${night ? `<img class="thumb wide" alt="" src="${esc(night)}" />` : `<div class="thumb wide"></div>`}
      <div>
        <b>${esc(place.name)}</b>
        <p class="help">白天：${place.imageFile ? esc(place.imageFile) : "还没有"}</p>
        <p class="help">夜晚：${place.nightImageFile ? esc(place.nightImageFile) : "还没有"}</p>
        <label>换白天的图</label>
        <input type="file" accept="image/*" data-crop="location-day" data-location-id="${esc(place.id)}" />
        <label>换夜晚的图</label>
        <input type="file" accept="image/*" data-crop="location-night" data-location-id="${esc(place.id)}" />
        ${triggers}
      </div>
    </div>`;
}

function cardsHtml() {
  const players = library.characters.filter((item) => item.kind === "player");
  return `
    <h2>人设卡</h2>
    <p class="help">每位默认角色都写好了全身图的位置。图片放进那个文件夹后，舞台上才会看见。头像和全身图都可以裁一下再留下。</p>
    <div class="row">
      <button class="primary" type="button" data-new="player">新的玩家人设</button>
      <button class="ghost" type="button" data-new="npc">新的角色（记在当前舞台）</button>
    </div>
    <h3>我</h3>
    <div class="grid">${players.map(cardHtml).join("")}</div>
    ${library.stages
      .map((stage) => {
        const people = library.characters.filter((item) => item.stageId === stage.id);
        return `<h3>${esc(stage.name)}</h3><div class="grid">${people.map(cardHtml).join("")}</div>`;
      })
      .join("")}
    ${library.characters.some((item) => item.kind === "npc" && !item.stageId) ? `<h3>还没归到舞台的角色</h3><div class="grid">${library.characters.filter((item) => item.kind === "npc" && !item.stageId).map(cardHtml).join("")}</div>` : ""}
  `;
}

function cardHtml(person) {
  const avatar = pictureUrl(person, "avatar");
  const body = pictureUrl(person, "fullBody");
  return `
    <form class="card" data-card="${esc(person.id)}">
      <h3>${person.kind === "player" ? "玩家人设" : esc(person.name)}</h3>
      <div class="portrait-row">
        ${avatar ? `<img class="thumb" alt="" src="${esc(avatar)}" />` : `<div class="thumb"></div>`}
        ${body ? `<img class="thumb" alt="" src="${esc(body)}" />` : `<div class="thumb"></div>`}
      </div>
      <label>名字</label>
      <input name="name" type="text" value="${esc(person.name)}" />
      <label>简介</label>
      <textarea name="summary">${esc(person.summary)}</textarea>
      <label>性格</label>
      <textarea name="personality">${esc(person.personality)}</textarea>
      <label>说话习惯</label>
      <input name="speechStyle" type="text" value="${esc(person.speechStyle)}" />
      <label>头像（可裁成方形）</label>
      <input type="file" accept="image/*" data-crop="avatar" data-person="${esc(person.id)}" />
      <p class="help">${person.avatarFile ? `已记下 ${esc(person.avatarFile)}` : "还没有单独的头像。对话框会先用全身图。"}</p>
      <label>全身图 / 立绘（可裁成立绘）</label>
      <input type="file" accept="image/*" data-crop="full" data-person="${esc(person.id)}" />
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
  const stage = library.stages.find((item) => item.id === library.activeStageId);
  const npcs = library.characters.filter((item) => item.kind === "npc" && item.stageId === library.activeStageId);
  if (!library.stagePicked) {
    return `<h2>这场戏</h2><p class="help">还没选舞台。选完以后，这里只出现那三位。</p><button class="primary" type="button" data-open-picker>去选舞台</button>`;
  }
  return `
    <h2>这场戏</h2>
    <p class="help">${esc(stage?.name || "")} 的人在这一场。多于一位是群聊；只留一位就是一对一。现在是 <b>${esc(library.view.formLabel)}</b>。别的舞台的角色不会出现在这张名单里。</p>
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
    <p class="help">档存在这台电脑上，不上传。读档会回到存下去的那一句，连同当时的舞台和地点。</p>
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
    <p class="help">以后可以把自己的人设、世界书或剧情包发给朋友。这一版只做出入口：导出的是占位文件，导入也只登记、不真正读进去。世界书导出会带上三座舞台。</p>
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
  const localStatus = model.localProbe?.ok ? model.localProbe.message : "";
  return `
    <h2>模型设置</h2>
    <p class="help">剧戏台不附带模型。本机推理（推荐）或云端接口，都要你自己准备。连上了，这一版也不会拿它来演戏。</p>
    ${model.remindRetest ? `<div class="callout">这次打开软件，请再测一次本机连接。上次的结果还留在下面，但不代表现在仍然通着。</div>` : ""}
    <div class="callout">需人工完成：安装 Ollama 或其他本机推理软件，以及下载模型。请只从官方渠道获取官方开源模型。</div>
    ${prerequisites ? `<p class="help">${esc(prerequisites.ollama)}</p>` : ""}
    <form id="model-form" class="grid" style="margin-top:14px">
      <div class="block">
        <h3>本机</h3>
        <label class="check"><input type="radio" name="provider" value="local" ${model.provider !== "cloud" ? "checked" : ""} /> 以后优先用这台电脑</label>
        <label>本机地址</label>
        <input name="localBaseUrl" type="url" value="${esc(model.localBaseUrl)}" />
        <label>模型名（你自己装的那个）</label>
        <input name="localModel" type="text" value="${esc(model.localModel)}" placeholder="例如你在 Ollama 里看到的名字" />
        ${localStatus ? `<p class="model-status">${esc(localStatus)}</p>` : `<p class="help">测通之后，这里会留下一句：连上了。这一版还不会用它来演戏，只确认路是通的。</p>`}
      </div>
      <div class="block">
        <h3>旧的单接口（仍可用）</h3>
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
        <button class="ghost" type="button" id="test-model">测试本机连接</button>
      </div>
    </form>
    <h3>云端接口位</h3>
    <p class="help">一家接口可以绑 2 到 3 位角色，例如 DeepSeek、通义千问。这里只是先把人对上，演戏时还不会真的去调用。</p>
    <div class="grid">
      ${(model.cloudSlots || []).map((slot) => slotHtml(slot)).join("")}
    </div>
    <h3>免责声明</h3>
    <div class="callout">${esc(library.view.disclaimer)}</div>
    <p class="help">不确定显卡能跑什么，可以看 <a href="https://www.canirun.ai/models" target="_blank" rel="noreferrer">canirun.ai</a>，或重新打开新手引导。</p>
  `;
}

function slotHtml(slot) {
  const groups = library.stages
    .map((stage) => {
      const people = library.characters.filter((item) => item.stageId === stage.id);
      return `<p class="help">${esc(stage.name)}</p>${people
        .map(
          (person) => `
          <label class="check">
            <input type="checkbox" name="characterIds" value="${esc(person.id)}" ${slot.characterIds.includes(person.id) ? "checked" : ""} />
            <span>${esc(person.name)}</span>
          </label>`,
        )
        .join("")}`;
    })
    .join("");
  return `
    <form class="block slot-form" data-slot="${esc(slot.id)}">
      <h3>${esc(slot.label)}</h3>
      <label>显示名</label>
      <input name="label" type="text" value="${esc(slot.label)}" />
      <label>地址</label>
      <input name="baseUrl" type="url" value="${esc(slot.baseUrl)}" placeholder="OpenAI 兼容地址" />
      <label>模型名</label>
      <input name="model" type="text" value="${esc(slot.model)}" />
      <label>钥匙（只存在这台电脑）</label>
      <input name="apiKey" type="password" value="" placeholder="${slot.apiKeySet ? "已保存。留空表示不改" : "可选"}" autocomplete="off" />
      <label class="check"><input name="clearApiKey" type="checkbox" /> 清掉这家的钥匙</label>
      <label>绑哪些角色（最多三位）</label>
      ${groups}
      <div class="row">
        <button class="primary" type="submit">保存这个接口</button>
        <button class="ghost" type="button" data-test-slot="${esc(slot.id)}">测试这家</button>
      </div>
    </form>
  `;
}

function guidePageHtml() {
  const advice = hardware?.advice;
  return `
    <h2>新手引导</h2>
    <p class="help">给完全没配过模型的人。剧戏台检测显存和本机推理软件，只是为了说明方向，不会替你下载任何模型。</p>
    <div class="block">
      <h3>先看这台电脑</h3>
      <p>${esc(prerequisites?.node || "你能看见这个页面，说明 Node.js 已经在跑。")}</p>
      <p>${esc(prerequisites?.ollama || "")}</p>
    </div>
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

function sideHtml(session) {
  const scene = library.view.scene;
  const book = library.worldBooks.find((item) => item.id === session.worldBookId);
  const cast = castOf(session);
  return `
    <h2>这场</h2>
    <p>${esc(scene.stageName || "还没选舞台")} · ${esc(library.view.formLabel)}。${book ? `世界书「${esc(book.name)}」只挂这一本。` : "选完舞台后，这里只挂那一本。"}</p>
    ${
      book
        ? `<label>地点</label>
           <select id="location-pick">
             ${book.locations.map((item) => `<option value="${esc(item.id)}" ${item.id === scene.locationId ? "selected" : ""}>${esc(item.name)}</option>`).join("")}
           </select>
           <div class="row">
             <button type="button" class="mode" data-time="day" aria-pressed="${scene.timeOfDay !== "night"}">白天</button>
             <button type="button" class="mode" data-time="night" aria-pressed="${scene.timeOfDay === "night"}">夜晚</button>
           </div>`
        : `<button class="primary" type="button" data-open-picker>选一座舞台</button>`
    }
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
    ${
      cast.length
        ? cast
            .map((person) => {
              const alive = session.state.alive?.[person.id] !== false;
              return `<div class="person"><span>${esc(person.name)}</span><span>${alive ? "在台上" : "已离场"}</span></div>`;
            })
            .join("")
        : `<p>还没有请人。先选舞台。</p>`
    }
    <p>缺图也可以继续。立绘和背景都留在你自己的电脑上。</p>
  `;
}

function stagePickerHtml() {
  const tip =
    pickerIntent === "new"
      ? "我们为您准备了三个世界供您体验。请选择。"
      : pickerIntent === "continue"
        ? "继续故事会读这台电脑上已经存下的档，台上回到当时的舞台和进度。"
        : "从头开始是新的一场。继续故事会打开已经存下的档。";
  return `
    <div class="modal-back">
      <div class="modal stage-modal" role="dialog" aria-modal="true" aria-labelledby="stage-title">
        <div class="steps">请选择</div>
        <h2 id="stage-title">今天想要开始的舞台</h2>
        <div class="picker-choice" role="group" aria-label="开始方式">
          <button type="button" id="pick-new" aria-pressed="${pickerIntent === "new" ? "true" : "false"}">从头开始</button>
          <button type="button" id="pick-continue" aria-pressed="${pickerIntent === "continue" ? "true" : "false"}">继续故事</button>
        </div>
        <p id="picker-tip">${esc(tip)}</p>
        ${pickerIntent === "new" ? stageCardsHtml() : ""}
        ${pickerIntent === "continue" ? continueSavesHtml() : ""}
        ${forcePicker && library.stagePicked ? `<div class="row"><button class="ghost" type="button" id="close-picker">先不换</button></div>` : ""}
      </div>
    </div>
  `;
}

function stageCardsHtml() {
  return `
    <div class="stage-grid">
      ${library.stages
        .map((stage) => {
          const book = library.worldBooks.find((item) => item.id === stage.worldBookId);
          const names = stage.characterIds.map((id) => nameOf(id)).join("、");
          return `
            <button type="button" class="stage-card" data-stage="${esc(stage.id)}">
              <span>${esc(stage.tone)}</span>
              <strong>${esc(stage.name)}</strong>
              <p>${esc(book?.summary || "")}</p>
              <em>${esc(names)}</em>
            </button>`;
        })
        .join("")}
    </div>
  `;
}

function continueSavesHtml() {
  if (!library.saves.length) {
    return `
      <div class="callout" id="continue-empty">
        还没有可以继续的故事。这台电脑上还没有存档。请先从头开始；演过之后，在左侧「存档」里留下进度，下次就能从这里接着演。
      </div>
      <div class="row"><button class="primary" type="button" id="empty-to-new">改为从头开始</button></div>
    `;
  }
  return `
    <div class="stack" id="continue-list">
      ${library.saves
        .map(
          (save) => `
          <div class="block">
            <b>${esc(save.name)}</b>
            <p class="help">${esc(save.at)} · ${esc(save.snapshot?.name || "未命名舞台")}</p>
            <div class="row"><button class="primary" type="button" data-continue="${esc(save.id)}">读这个档</button></div>
          </div>`,
        )
        .join("")}
    </div>
  `;
}

function guideModalHtml() {
  const advice = hardware?.advice;
  const pages = [
    `<h2>欢迎来到剧戏台</h2><p>这是装在你自己电脑上的演戏工具。故事、人设和存档都留在本地。软件本身不带 AI 模型。</p><p>开场要先选一座舞台：霜印王国、青玄界，或霓穹市。一座舞台三位角色。</p>`,
    `<h2>这台电脑</h2><p>${esc(prerequisites?.node || "你能看见这个页面，说明 Node.js 已经在跑。这一项不用再检查。")}</p><p>${esc(prerequisites?.ollama || "本机推理软件稍后再测也行。")}</p>`,
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
          ${guideStep < pages.length - 1 ? `<button class="primary" type="button" id="guide-next">下一步</button>` : `<button class="primary" type="button" id="guide-finish">${library.stagePicked ? "回到剧戏台" : "去选舞台"}</button>`}
        </div>
      </div>
    </div>
  `;
}

function toastHtml() {
  if (!notice) return "";
  return `<p class="toast ${notice.tone === "bad" ? "bad" : ""}" role="status">${esc(notice.text)}</p>`;
}

function settleSprites() {
  app.querySelectorAll(".sprite img").forEach((img) => {
    const reveal = () => img.parentElement?.classList.add("has-art");
    const hide = () => img.remove();
    if (img.complete) {
      if (img.naturalWidth > 0) reveal();
      else hide();
    } else {
      img.addEventListener("load", reveal);
      img.addEventListener("error", hide);
    }
  });
}

function armToast() {
  window.clearTimeout(toastTimer);
  if (!notice) return;
  toastTimer = window.setTimeout(() => {
    notice = null;
    app.querySelector(".toast")?.remove();
  }, 4200);
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
  app.querySelector("#pick-new")?.addEventListener("click", () => {
    pickerIntent = "new";
    render();
  });
  app.querySelector("#pick-continue")?.addEventListener("click", () => {
    pickerIntent = "continue";
    render();
  });
  app.querySelector("#empty-to-new")?.addEventListener("click", () => {
    pickerIntent = "new";
    render();
  });
  app.querySelectorAll("[data-stage]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (pickerIntent !== "new") return;
      const needsReset = Boolean(library.stagePicked) || library.sessions[0].npcIds.length > 0;
      if (needsReset && !confirm("从头开始会清掉当前这场还没另外存下的进度。已经存好的档还在。")) return;
      view = "stage";
      location.hash = "stage";
      forcePicker = false;
      pickerIntent = "";
      const ok = await act({ type: "run.start", stageId: button.dataset.stage });
      if (!ok) {
        forcePicker = true;
        pickerIntent = "new";
        render();
      }
    });
  });
  app.querySelectorAll("[data-continue]").forEach((button) => {
    button.addEventListener("click", async () => {
      view = "stage";
      location.hash = "stage";
      forcePicker = false;
      pickerIntent = "";
      const ok = await act({ type: "save.load", saveId: button.dataset.continue });
      if (!ok) {
        forcePicker = true;
        pickerIntent = "continue";
        render();
      }
    });
  });
  app.querySelector("#close-picker")?.addEventListener("click", () => {
    forcePicker = false;
    pickerIntent = "";
    render();
  });
  app.querySelectorAll("[data-open-picker]").forEach((button) => {
    button.addEventListener("click", () => {
      forcePicker = true;
      render();
    });
  });
  app.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => act({ type: "session.setMode", mode: button.dataset.mode }));
  });
  app.querySelectorAll("[data-time]").forEach((button) => {
    button.addEventListener("click", () => act({ type: "session.setTime", timeOfDay: button.dataset.time }));
  });
  const locationPick = app.querySelector("#location-pick");
  locationPick?.addEventListener("change", () => act({ type: "session.setLocation", locationId: locationPick.value }));

  const say = app.querySelector("#say-form");
  say?.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = new FormData(say).get("text");
    act({ type: "session.send", text });
  });

  app.querySelector("#book-focus")?.addEventListener("change", (event) => {
    bookFocus = event.target.value;
    render();
  });
  app.querySelector("#book-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    act({ type: "world.update", worldBookId: focusedBook()?.id, name: data.get("name"), summary: data.get("summary") });
  });
  app.querySelector("#entry-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    act({
      type: "world.addEntry",
      worldBookId: focusedBook()?.id,
      title: data.get("title"),
      body: data.get("body"),
      keywords: data.get("keywords"),
    });
  });
  app.querySelector("#patch-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    act({ type: "world.addPatch", worldBookId: focusedBook()?.id, title: data.get("title"), body: data.get("body") });
  });
  app.querySelectorAll("[data-patch]").forEach((button) => {
    button.addEventListener("click", () => act({ type: "world.togglePatch", patchId: button.dataset.patch }));
  });
  app.querySelector("#location-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    act({ type: "world.addLocation", worldBookId: focusedBook()?.id, name: data.get("name") });
  });
  app.querySelector("#trigger-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    act({
      type: "world.addTrigger",
      locationId: data.get("locationId"),
      name: data.get("name"),
      keywords: data.get("keywords"),
    });
  });

  app.querySelectorAll("[data-crop]").forEach((input) => {
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      input.value = "";
      if (!file) return;
      const kind = input.dataset.crop;
      const aspect = kind === "avatar" ? 1 : kind === "full" ? 2 / 3 : 16 / 9;
      const title = kind === "avatar" ? "裁头像" : kind === "full" ? "裁全身图" : "裁地点图";
      openCropper({
        file,
        aspect,
        title,
        onDone: async (savedPath) => {
          if (kind === "avatar" || kind === "full") {
            const fields = kind === "avatar" ? { avatarFile: savedPath } : { fullBodyFile: savedPath };
            previews.set(`${input.dataset.person}:${kind === "avatar" ? "avatar" : "fullBody"}`, mediaUrl(savedPath));
            await act({ type: "character.update", id: input.dataset.person, fields });
            return;
          }
          const slot = kind === "location-night" ? "night" : kind === "trigger" ? "trigger" : "day";
          const previewKey = slot === "night" ? `loc-night:${input.dataset.locationId}` : `loc:${input.dataset.locationId}`;
          previews.set(previewKey, mediaUrl(savedPath));
          await act({
            type: "world.setLocationImage",
            locationId: input.dataset.locationId,
            imageFile: savedPath,
            slot,
            triggerId: input.dataset.triggerId || "",
          });
        },
      });
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
  app.querySelectorAll(".slot-form").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      act({
        type: "model.updateSlot",
        slotId: form.dataset.slot,
        label: data.get("label"),
        baseUrl: data.get("baseUrl"),
        model: data.get("model"),
        apiKey: data.get("apiKey"),
        clearApiKey: data.get("clearApiKey") === "on",
        characterIds: data.getAll("characterIds"),
      });
    });
  });
  app.querySelectorAll("[data-test-slot]").forEach((button) => {
    button.addEventListener("click", () => testSlot(button.dataset.testSlot));
  });

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
    guideOpen = false;
    const ok = await act({ type: "guide.complete", disclaimerAccepted: true });
    if (!ok) {
      guideOpen = true;
      render();
    }
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
  notice = { tone: "ok", text: "正在试着连接本机模型…" };
  render();
  try {
    const response = await fetch("/api/model/test", { method: "POST" });
    const data = await response.json();
    if (data.library) library = data.library;
    notice = { tone: data.ok ? "ok" : "bad", text: data.message };
  } catch {
    notice = { tone: "bad", text: "测试没有完成。请确认启动窗口还在。" };
  }
  render();
}

async function testSlot(slotId) {
  notice = { tone: "ok", text: "正在试这家云端…" };
  render();
  try {
    const response = await fetch("/api/model/test-slot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slotId }),
    });
    const data = await response.json();
    notice = { tone: data.ok ? "ok" : "bad", text: data.message };
  } catch {
    notice = { tone: "bad", text: "这家云端没有测完。请确认启动窗口还在。" };
  }
  render();
}

function openCropper({ file, aspect, title, onDone }) {
  const overlay = document.createElement("div");
  overlay.className = "modal-back";
  overlay.innerHTML = `
    <div class="modal crop-modal" role="dialog" aria-modal="true">
      <h2>${esc(title)}</h2>
      <p class="help">拖动图片，用滑杆放大。框里的部分会留下。</p>
      <div class="crop-frame" id="crop-frame"></div>
      <label for="crop-zoom">放大</label>
      <input id="crop-zoom" type="range" min="1" max="3" step="0.01" value="1" />
      <div class="row">
        <button class="primary" type="button" id="crop-ok">裁好了</button>
        <button class="ghost" type="button" id="crop-cancel">取消</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const frame = overlay.querySelector("#crop-frame");
  const wide = aspect >= 1.2;
  frame.style.width = wide ? "min(520px, 86vw)" : "min(320px, 80vw)";
  frame.style.aspectRatio = String(aspect);
  const img = new Image();
  const blobUrl = URL.createObjectURL(file);
  img.alt = "";
  img.className = "crop-image";
  frame.appendChild(img);
  let zoom = 1;
  let ox = 0;
  let oy = 0;
  let drag = null;

  function layout() {
    if (!img.naturalWidth) return;
    const frameW = frame.clientWidth;
    const frameH = frame.clientHeight;
    const cover = Math.max(frameW / img.naturalWidth, frameH / img.naturalHeight);
    const dispW = img.naturalWidth * cover * zoom;
    const dispH = img.naturalHeight * cover * zoom;
    ox = clamp(ox, frameW - dispW, 0);
    oy = clamp(oy, frameH - dispH, 0);
    img.style.width = `${dispW}px`;
    img.style.height = `${dispH}px`;
    img.style.left = `${ox}px`;
    img.style.top = `${oy}px`;
  }

  img.onload = () => layout();
  img.src = blobUrl;
  overlay.querySelector("#crop-zoom").addEventListener("input", (event) => {
    zoom = Number(event.target.value);
    layout();
  });
  frame.addEventListener("pointerdown", (event) => {
    drag = { x: event.clientX, y: event.clientY, ox, oy };
    frame.setPointerCapture(event.pointerId);
  });
  frame.addEventListener("pointermove", (event) => {
    if (!drag) return;
    ox = drag.ox + event.clientX - drag.x;
    oy = drag.oy + event.clientY - drag.y;
    layout();
  });
  frame.addEventListener("pointerup", () => {
    drag = null;
  });
  overlay.querySelector("#crop-cancel").addEventListener("click", () => close());
  overlay.querySelector("#crop-ok").addEventListener("click", async () => {
    if (!img.naturalWidth) return;
    const frameW = frame.clientWidth;
    const frameH = frame.clientHeight;
    const cover = Math.max(frameW / img.naturalWidth, frameH / img.naturalHeight);
    const scale = cover * zoom;
    const canvas = document.createElement("canvas");
    canvas.width = wide ? 1280 : 800;
    canvas.height = Math.max(1, Math.round(canvas.width / aspect));
    const context = canvas.getContext("2d");
    context.drawImage(
      img,
      -ox / scale,
      -oy / scale,
      frameW / scale,
      frameH / scale,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    close();
    if (!blob) {
      notice = { tone: "bad", text: "这张图没有裁下来。" };
      render();
      return;
    }
    try {
      const savedPath = await uploadMedia(blob);
      await onDone(savedPath);
    } catch (error) {
      notice = { tone: "bad", text: error instanceof Error ? error.message : "图片没保存下来。" };
      render();
    }
  });

  function close() {
    URL.revokeObjectURL(blobUrl);
    overlay.remove();
  }
}

async function uploadMedia(blob) {
  const dataUrl = await blobToDataUrl(blob);
  const response = await fetch("/api/media", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dataUrl }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "图片没保存下来。");
  return data.path;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("图片读不出来。"));
    reader.readAsDataURL(blob);
  });
}

function download(file) {
  const blob = new Blob([JSON.stringify(file.body, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = file.filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function focusedBook() {
  return (
    library.worldBooks.find((item) => item.id === bookFocus) ||
    library.worldBooks.find((item) => item.id === library.sessions[0].worldBookId) ||
    library.worldBooks[0]
  );
}

function castOf(session) {
  const ids = [session.playerCardId, ...session.npcIds];
  return ids.map((id) => library.characters.find((item) => item.id === id)).filter(Boolean);
}

function currentSpeaker(session) {
  const last = [...session.messages].reverse().find((item) => item.kind !== "system");
  const person = last ? library.characters.find((item) => item.id === last.speakerId) : null;
  if (!person) return { id: "system", name: last?.speakerName || "戏台", src: "" };
  return { id: person.id, name: person.name, src: pictureUrl(person, "avatar") };
}

function pictureUrl(person, slot) {
  const preview = previews.get(`${person.id}:${slot}`);
  if (preview) return preview;
  if (slot === "avatar") return mediaUrl(person.avatarFile) || mediaUrl(person.fullBodyFile);
  return mediaUrl(person.fullBodyFile);
}

function pictureOfLocation(place, slot) {
  const key = slot === "night" ? `loc-night:${place.id}` : `loc:${place.id}`;
  return previews.get(key) || mediaUrl(slot === "night" ? place.nightImageFile : place.imageFile);
}

function rememberScene(sceneUrl) {
  if (!sceneUrl || sceneCache.has(sceneUrl)) return;
  sceneCache.set(sceneUrl, "pending");
  const probe = new Image();
  const finish = (status) => {
    sceneCache.set(sceneUrl, status);
    if (view === "stage") queueMicrotask(() => render());
  };
  probe.onload = () => finish("ok");
  probe.onerror = () => finish("missing");
  probe.src = sceneUrl;
}

function mediaUrl(file) {
  const text = String(file || "");
  if (!text || text.includes("..")) return "";
  if (text.startsWith("blob:") || text.startsWith("data:")) return text;
  if (text.startsWith("assets/defaults/")) return `/${encodeURI(text)}`;
  if (text.startsWith("data/media/")) return `/media/${encodeURI(text.slice("data/media/".length))}`;
  return "";
}

function nameOf(id) {
  return library.characters.find((item) => item.id === id)?.name || "";
}

function accent(id) {
  let total = 0;
  for (const char of String(id)) total += char.charCodeAt(0);
  return accents[total % accents.length];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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
