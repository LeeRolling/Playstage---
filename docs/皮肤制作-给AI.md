# 皮肤制作说明（给 AI）

这份文档是写给 AI 的。玩家会把全文贴给你，或告诉你文件在 `docs/皮肤制作-给AI.md`。给人看的步骤在 [自定义皮肤.md](自定义皮肤.md)。你按这一份改，改完用中国话向玩家说明你动了哪几行。

只改外观。不要借机重排页面、重命名 class、或改演戏逻辑。

## 改哪里

| 要做的事 | 文件 |
| --- | --- |
| 改颜色、圆角、边线、角花变量 | `src/ui/styles.css` |
| 自己的角花图（可选） | `assets/skins/eastern/`、`assets/skins/cyber/`、`assets/skins/nordic/`，需要时也可以 `assets/skins/classic/` |

样式由本机服务直接读出，带 `cache-control: no-store`。保存 `styles.css` 后，让玩家刷新浏览器即可。不必重启进程，也不必改 `data/library.json`。

## 四套皮肤写在哪

页面把当前皮肤写在 `<html data-skin="...">` 上（`document.documentElement.dataset.skin`）。合法值只有这四个，和界面按钮、`src/domain/settings.js` 里的 `SKIN_IDS` 一致。不要发明第五个 id，例如 `pastel`。设置接口会拒绝，并提示「没有这套皮肤」。

| `data-skin` | 界面上的名字 | CSS 位置 | 「跟随舞台」时 |
| --- | --- | --- | --- |
| `classic` | 经典 | 文件最上面的 `:root`。没有 `html[data-skin="classic"]` 这一段 | 还没选舞台，或这座舞台没有单独的皮肤 |
| `eastern` | 东方 · 青玄 | `html[data-skin="eastern"] { ... }` | 青玄界 |
| `cyber` | 赛博 · 霓穹 | `html[data-skin="cyber"] { ... }` | 霓穹市 |
| `nordic` | 北欧 · 霜印 | `html[data-skin="nordic"] { ... }` | 霜印王国 |

经典就是 `:root` 里那一组。改经典时改文件开头，不要新写一个 `data-skin="classic"` 块把后三套盖掉。后三套只写自己要覆盖的变量，没写的会沿用 `:root`。

玩家在右侧「皮肤」里选择：

- `settings.uiSkinMode = "auto"`：跟随舞台。
- `settings.uiSkinMode = "manual"`：固定用 `settings.uiSkin`（`classic` / `eastern` / `cyber` / `nordic`），换舞台也不改。

不要为了换皮肤去改设置文件。让玩家在界面上点。

## 变量：只改冒号右边

每个名字管一块地方。颜色一般是 `#` 加六位，例如 `#1a2332`。圆角和线宽是数字加 `px`，例如 `4px` 或 `0px`。`transparent` 表示完全透明。

保留左边的名字和行末分号。不要删掉某一套里已经列出的变量；缺了会退回经典，或让那一块变成空白。

玩家最常改的是这些：

| 名字 | 管什么 |
| --- | --- |
| `--bg` | 整页底色 |
| `--paper` | 平时的字 |
| `--paper-dim` | 次要的字 |
| `--muted` | 更淡的说明 |
| `--gold` | 强调色（链接、一些标题） |
| `--line` | 分割用的细线 |
| `--dialog-bg` | 对话框的底 |
| `--dialog-ink` | 对话框里的字 |
| `--dialog-muted` | 对话框里比较淡的字 |
| `--dialog-border` | 对话框的边 |
| `--name-ink` | 说话人名字的字色 |
| `--name-chip` | 名字后面的色块。不需要色块就写 `transparent` |
| `--name-pad` / `--name-radius` | 名字色块的内边距和圆角。没有色块时保持原样即可 |
| `--button-bg` | 按钮的底 |
| `--button-ink` | 按钮上的字 |
| `--button-border` | 按钮描边。不需要描边写 `transparent`，并把 `--button-border-width` 写成 `0px` |
| `--button-border-width` | 按钮描边粗细 |

同一文件里还有这些，玩家点名时再改，不要顺手全部换掉：

| 名字 | 管什么 |
| --- | --- |
| `--chrome` / `--rail` / `--side` | 顶栏、左侧功能条、右侧栏 |
| `--stage-wash` | 还没放背景图时，舞台本身的底色 |
| `--curtain` | 没背景图时两侧的幕布 |
| `--frame` | 边框粗细 |
| `--radius-dialog` / `--radius-button` / `--radius-control` / `--radius-card` / `--radius-input` / `--radius-pill` / `--radius-stage` / `--radius-thumb` | 各处圆角。数字小更方 |
| `--ledger-bg` / `--ledger-ink` / `--ledger-muted` | 「世界」「人设」这些内页的底和字 |
| `--modal-bg` / `--modal-ink` / `--modal-muted` / `--modal-border` | 弹出来的窗口 |
| `--input-bg` / `--field-ink` | 输入框的底和字 |
| `--plaque-bg` / `--plaque-border` | 舞台上方地名条 |
| `--corner-marks` | 边角花纹。见下一节 |
| `--thumb-bg` | 还没有图片时，缩略图空位的底色 |

`--gold-soft`、`--dialog-shadow`、`--portrait-border`、`--composer-line`、`--hover-glow`、`--ghost-ink`、`--ghost-border`、`--danger`、`--selected-*`、`--picker-selected-*`、`--rail-active-*`、`--notice-*`、`--toast-*`、`--card-border`、`--crop-bg`、`--float-bg`、`--ribbon-*` 也在同一组里。只在玩家要求「整套换色」时一起改，并保持同一套内部对比度够读。

## 角花图

这一版默认的边角是样式画的，不附带图片。

图放在：

- `assets/skins/eastern/`
- `assets/skins/cyber/`
- `assets/skins/nordic/`
- 经典若也要图：`assets/skins/classic/`

文件名自定，例如 `corner.svg` 或 `corner.png`。小图、尽量方、底透明。网页访问路径是 `/assets/skins/eastern/corner.svg` 这种（服务把 `assets/` 挂在 `/assets/` 下）。不要写成相对磁盘路径。

在对应皮肤的 `--corner-marks` 最前面加上图片，并留一个逗号，后面原来的线条可以保留：

```css
--corner-marks: url("/assets/skins/eastern/corner.svg"),
```

若只要这张图，逗号后面直到分号之前都删掉，只留这一句 `url(...)`。

东方和赛博已经有 `::after`，把 `--corner-marks` 画在 `.dialog`、`.plaque`、`.modal`、`.ledger`、`.stage-card` 上。北欧和经典目前没有这段 `::after`。给这两套加角花时，要照着东方那段补上同样的 `::after`（选择器改成 `html[data-skin="nordic"]` 或你为经典新增的选择器）。只改变量，图不会出现。

`::after` 必须保持 `pointer-events: none`，否则会挡住点击。

## 保存与刷新

1. 只改冒号右边的值（以及玩家要的角花 `url`）。
2. 保存 `src/ui/styles.css`。角花文件保存到上面的文件夹。
3. 让玩家刷新剧戏台页面。
4. 若皮肤是「跟随舞台」，先打开对应舞台，或让玩家在右侧点那一套的名字，才能看见这一套。

## 不要动这些

下面任何一条都不要改，除非玩家用明确的句子要求，并且你先说明会动到功能：

- **窗口锁定。** `html, body` 和 `.shell` 的 `height: 100dvh`、`overflow: hidden`，以及 `.shell` 的网格（左功能条、中舞台、右栏）。整页不能再出现文档滚动条。台词、侧栏、账本在各自区域里滚。
- **立绘站位。** `.sprite`、`.sprites`、`.pose` 相关规则，以及人设卡上的左右、上下、放大。说话时未开口的立绘用 `.sprite.is-quiet { filter: brightness(0.5) }` 变暗；背景在 `.stage-bg`，不要加 brightness。这两件事不跟皮肤走。
- **地点选择。** 右侧「地点」下拉和白天 / 夜晚切换。世界书里每个地点的「换白天的图」「换夜晚的图」文件输入要留着。
- **皮肤 id 与跟随舞台。** 不要改 `classic` / `eastern` / `cyber` / `nordic` 这四个字符串，不要改舞台和皮肤的对应关系。
- **功能层。** 不要改 `src/domain/`、`src/server/`。界面不要去 `import` 这两层。
- **东方皮肤的对比度补丁。** `html[data-skin="eastern"]` 变量块后面还有几段，把账本和弹窗上的按钮、说明、输入框改成深色字，并把右侧地点下拉保持深底浅字。账本是宣纸色，右侧栏是深色。若你改了东方的 `--ledger-*`、`--modal-*` 或 `--side`，必须同时检查这几段硬编码颜色（`#1a2332`、`#f3e9d7`、`#101820` 等），否则字会看不见。不要删掉这几段。
- **赛博、北欧变量块外面的装饰。** 例如 `html[data-skin="cyber"] .dialog` 的底边，以及北欧对话框的内描边。不要在换色时删掉，除非玩家不要那条线。
- **选择器结构。** 角花 `::after`、地点卡片（`.location-card`）、人设缩略图（`.portrait-row`）的布局可以留着。换色不要改成另一套排版。

改完后自查：四套皮肤的变量块还在；经典仍是 `:root`；每个改过的声明都有分号；东方浅色账本上的字仍然是深色；刷新后对话框、按钮、名字色和页面底色符合玩家说的那一套。
