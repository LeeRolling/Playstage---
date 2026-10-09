/**
 * 新手引导文案。只产生给人看的说明，不下载、不推荐具体权重文件。
 */

const CANIRUN = "https://www.canirun.ai/models";

export const DISCLAIMER =
  "剧戏台只提供这套软件，不提供、也不附带任何 AI 模型。模型从哪里下载、能不能用，由你自己负责。我们只建议到模型官方渠道下载官方开源模型。成人或敏感内容取决于你选用的模型和你自己的判断，软件不会承诺「已经替你审查过模型」。";

export function adviseFromVram(vramMb) {
  if (vramMb == null || Number.isNaN(Number(vramMb))) {
    return {
      level: "unknown",
      title: "还没读到显存",
      body: `没有关系，这不影响先把软件打开。请自己打开 ${CANIRUN} ，按显卡查适合哪些模型。查不到合适的也不用着急：可以改用你自己的云端接口，或先用更轻的本地模型。剧戏台不提供、也不下载模型。`,
    };
  }

  const gb = Number(vramMb) / 1024;
  if (gb >= 7.5) {
    return {
      level: "around-8gb",
      title: "大约 8GB 显存",
      body: `这个量级通常可以找适合约 8GB 显存的开源文本模型。模型要你自己到官方渠道下载，剧戏台不代下。也可以再到 ${CANIRUN} 对一下你的显卡。`,
    };
  }

  if (gb >= 3.5) {
    return {
      level: "around-4gb",
      title: "大约 4GB 显存",
      body: `也有更轻的文本模型可以试，但体验有限：可能更慢、更简短。请到 ${CANIRUN} 自己查一查。剧戏台不提供模型，也不要求你为此换电脑。`,
    };
  }

  return {
    level: "limited",
    title: "显存比较少",
    body: `仍可以看看有没有很轻的本地模型，体验会更有限。请到 ${CANIRUN} 自查。如果没有合适的，可以改用你自己的云端接口，或先只用软件里的占位回复熟悉界面。`,
  };
}

export function completeGuide(library, disclaimerAccepted) {
  if (!disclaimerAccepted) {
    throw new Error("请先勾选「我已阅读免责声明」，再结束引导。");
  }
  const next = structuredClone(library);
  next.guide = {
    completed: true,
    disclaimerAccepted: true,
    completedAt: new Date().toISOString(),
  };
  return next;
}
