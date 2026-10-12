# 默认图片放哪里

剧戏台的种子数据里已经写好了路径。仓库里不一定带着图片本身。把你电脑上的图按下面的相对路径放进这个文件夹，重新打开剧戏台就能看见。没有图也可以先用文字演戏。

夜晚图和白天图放在同一个地点文件夹里。种子数据默认把文件名里的 `_白天` 换成 `_晚上`。如果你的夜晚文件用的是 `_夜晚`，在世界书里把那一条的夜晚路径改成实际文件名即可。

路径相对于剧戏台文件夹，不要打成绝对路径。

如果文件其实是 png，种子里却写成 jpg（或文件夹名字差一点），剧戏台会按同名图片自己对上，并改掉记下的路径。对不上时，舞台上仍会说明路径在、图还不在。已经放进 `data/media` 的图不会被删。

## 角色全身图、表情和动作

每位角色一个同名文件夹，里面再分 `立绘/`、`表情/`、`动作/`。放在 `assets/defaults/characters/女/` 下面，例如暖璃：

- `东方/暖璃/立绘/暖璃.png`
- `东方/暖璃/表情/01.png` 到 `10.png`（表情，一共十张，可以先空着）
- `东方/暖璃/动作/01.png` 到 `11.png`（动作，一共十一张，可以先空着）

九位默认角色都是这个样子：`北欧/Astrid`、`北欧/Sigrid`、`北欧/Elin`、`东方/暖璃`、`东方/月曈`、`东方/清言`、`现代/初棠`、`现代/星璇`、`现代/雪璟`。以前单张放在旁边的 `暖璃.png`，打开时会抄进 `暖璃/立绘/`，原来的那张还留着。

头像可以后裁。没裁之前，对话框左边会先用全身图。表情和动作在人设卡的「动作与表情」里选一张，演戏时舞台就换上那一张。若你的文件是 jpg，放到同名编号即可，例如 `表情/01.jpg`。

## 霜印王国（北欧）

- `assets/defaults/backgrounds/北欧/城镇/霜印城镇_白天.jpg`
- `assets/defaults/backgrounds/北欧/村庄/霜印村庄_白天.jpg`
- `assets/defaults/backgrounds/北欧/王宫大门/霜印王宫大门_白天.jpg`
- `assets/defaults/backgrounds/北欧/王宫内部/霜印王宫内部_白天.jpg`

## 青玄界（东方）

- `assets/defaults/backgrounds/东方/城镇/青玄城镇_白天.jpg`
- `assets/defaults/backgrounds/东方/村庄/青玄村庄_白天.jpg`
- `assets/defaults/backgrounds/东方/皇宫/青玄皇宫_白天.jpg`

## 霓穹市（现代）

白天路径如下。夜晚把 `_白天` 换成 `_晚上`，扩展名保持不变。

- `assets/defaults/backgrounds/现代/城市中心/赛博城市中心_白天.jpg`
- `assets/defaults/backgrounds/现代/办公室/赛博办公室_白天.png`
- `assets/defaults/backgrounds/现代/客厅/赛博客厅_白天.png`
- `assets/defaults/backgrounds/现代/卧室/赛博卧室_白天.jpg`
- `assets/defaults/backgrounds/现代/玄关/赛博玄关_白天.jpg`
- `assets/defaults/backgrounds/现代/厨房/赛博厨房_白天.jpg`
- `assets/defaults/backgrounds/现代/公园/赛博公园_白天.jpg`
- `assets/defaults/backgrounds/现代/商业中心/赛博商业中心_白天.jpg`
- `assets/defaults/backgrounds/现代/城市边缘/赛博城市边缘_白天.jpg`
- `assets/defaults/backgrounds/现代/废区/赛博废区_白天.jpg`
- `assets/defaults/backgrounds/现代/富人区/赛博富人区_白天.jpg`
- `assets/defaults/backgrounds/现代/贫民区/赛博贫民区_白天.jpg`
- `assets/defaults/backgrounds/现代/义体改造商店/赛博义体改造商店_白天.jpg`

自己后加的地点图会裁好后放进 `data/media/`，不需要放进这个文件夹。
