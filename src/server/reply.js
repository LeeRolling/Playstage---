/**
 * 玩家说完一句之后：先记进会话，再按发言方式请模型接话。
 * 提示词在功能层，真正的网络请求由调用方传入。
 */

import {
  actingTarget,
  appendSystemLine,
  buildActingMessages,
  commitNpcReply,
  finishCoolDown,
  planSpeakers,
  sendPlayerLine,
} from "../domain/index.js";

export async function replyToPlayer(library, text, complete) {
  let next = sendPlayerLine(library, text);
  const plan = planSpeakers(next);
  if (!plan.speakers.length) {
    return { library: next, message: "", tone: "ok" };
  }
  const target = actingTarget(next);
  if (!target.ok) {
    next = appendSystemLine(next, target.message);
    return { library: next, message: target.message, tone: "bad" };
  }
  for (let index = 0; index < plan.speakers.length; index += 1) {
    const speaker = plan.speakers[index];
    const messages = buildActingMessages(next, speaker.id, {
      mode: plan.mode,
      index,
      total: plan.speakers.length,
    });
    let result;
    try {
      result = await complete(target, messages);
    } catch {
      result = { ok: false, message: "模型调用中断了。请再送一句。" };
    }
    if (!result?.ok || !String(result.text || "").trim()) {
      const message = result?.message || "模型没有接上。请再试一次。";
      next = appendSystemLine(next, message);
      return { library: next, message, tone: "bad" };
    }
    try {
      next = commitNpcReply(next, speaker.id, result.text);
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "模型没有说出内容。";
      next = appendSystemLine(next, message);
      return { library: next, message, tone: "bad" };
    }
  }
  if (plan.coolDown) next = finishCoolDown(next);
  return { library: next, message: "", tone: "ok" };
}
