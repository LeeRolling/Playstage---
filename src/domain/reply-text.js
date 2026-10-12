/**
 * 模型台词先洗净，再拆表情和动作编号。
 * 思考标签、句式样例和照抄的名字前缀不能上台，也不能进表情/动作解析。
 * 编号沿用定稿表里的 expr_* / pose_*，不另起一套中文键。
 */

import { ACTION_SLOTS, EXPRESSION_SLOTS } from "./characters.js";

const EXPRESSION_IDS = new Set(EXPRESSION_SLOTS.map((slot) => slot.id));
const ACTION_IDS = new Set(ACTION_SLOTS.map((slot) => slot.id));

const THINK_WORD = "think|thinking|reasoning";

export function sanitizeModelReply(text, options = {}) {
  const raw = String(text ?? "");
  const leaked = hasLeakMark(raw);
  let value = stripThink(raw);
  value = stripScaffold(value, options.name || "");
  value = value.trim();
  if (nearlyEmpty(value, leaked)) return "";
  return value;
}

/**
 * 洗净之后再读表情/动作。台上只留台词。
 * 没有编号时，台词原样留下，云端不按这个格式写也不会被清空。
 */
export function prepareSpokenReply(text, name) {
  const sanitized = sanitizeModelReply(text, { name });
  if (!sanitized) return { line: "", expression: "", action: "" };
  let value = sanitized.replace(/^```[\w]*\n?/, "").replace(/```$/, "").trim();
  const paragraph = value.split(/\n{2,}/).map((item) => item.trim()).find(Boolean) || value;
  const cue = takePerformanceCue(paragraph);
  value = cue.line;
  if (name) value = value.replace(new RegExp(`^${escapeReg(name)}\\s*[：:]\\s*`), "");
  value = value.replace(/^[「"]/, "").replace(/[」"]$/, "").trim();
  if (nearlyEmpty(value, hasLeakMark(String(text ?? "")))) return { line: "", expression: "", action: "" };
  if (value.length > 600) value = `${value.slice(0, 600)}…`;
  return { line: value, expression: cue.expression, action: cue.action };
}

export function takePerformanceCue(text) {
  let expression = "";
  let action = "";
  let line = String(text || "");
  line = line.replace(/[【\[]\s*(expr_[a-z0-9_]+)\s*[】\]]/gi, (token, id) => {
    const key = String(id || "").toLowerCase();
    if (!EXPRESSION_IDS.has(key)) return "";
    if (!expression) expression = key;
    return "";
  });
  line = line.replace(/[【\[]\s*(pose_[a-z0-9_]+)\s*[】\]]/gi, (token, id) => {
    const key = String(id || "").toLowerCase();
    if (!ACTION_IDS.has(key)) return "";
    if (!action) action = key;
    return "";
  });
  line = line.replace(/[【\[]\s*(?:expr|pose)_[a-z0-9_]*\s*[】\]]/gi, "");
  return { expression, action, line: line.replace(/[ \t]{2,}/g, " ").trim() };
}

function hasLeakMark(text) {
  return new RegExp(`[<＜]\\s*/?\\s*(?:${THINK_WORD})\\b`, "i").test(text) || String(text).includes("句式样例");
}

function nearlyEmpty(text, leaked) {
  const visible = takePerformanceCue(text).line;
  const meaningful = visible.replace(/[\s\p{P}\p{S}]+/gu, "");
  if (!meaningful) return true;
  return Boolean(leaked) && meaningful.length <= 1;
}

function stripThink(text) {
  let value = String(text || "");
  value = value.replace(
    new RegExp(`[＜<]\\s*(/?)\\s*(${THINK_WORD})\\b([^<>＜＞\\n]{0,80})[＞>]`, "gi"),
    (_, slash, word, rest) => `<${slash}${word}${rest}>`,
  );
  const open = `<\\s*(?:${THINK_WORD})\\b[^>\\n]*>`;
  const close = `<\\s*/\\s*(?:${THINK_WORD})\\s*>`;
  value = value.replace(new RegExp(`${open}[\\s\\S]*?${close}`, "gi"), "");
  value = value.replace(new RegExp(`${open}[\\s\\S]*$`, "gi"), "");
  value = value.replace(new RegExp(`^[\\s\\S]*?${close}`, "gi"), "");
  value = value.replace(new RegExp(`[＜<]\\s*/?\\s*(?:${THINK_WORD})\\b[^＞>\\n]*[＞>]`, "gi"), "");
  value = value.replace(new RegExp(`^[\\s\\S]*?[＜<]\\s*/\\s*(?:${THINK_WORD})\\b`, "gi"), "");
  value = value.replace(new RegExp(`[＜<]\\s*(?:${THINK_WORD})\\b[^＞>\\n]*$`, "gi"), "");
  value = value.replace(new RegExp(`[＜<]\\s*/?\\s*(?:${THINK_WORD})\\b`, "gi"), "");
  value = value.replace(new RegExp(`/\\s*(?:${THINK_WORD})\\s*[＞>]`, "gi"), "");
  return value;
}

function stripScaffold(text, name) {
  const kept = [];
  for (const rawLine of String(text || "").split(/\n/)) {
    let line = rawLine.trim();
    if (!line) continue;
    if (line.includes("句式样例")) {
      line = line.replace(/^[\s\S]*?句式样例\s*[：:]?\s*/, "").trim();
    }
    line = stripLeadingSample(line, name);
    if (!line || isInstructionEcho(line)) continue;
    kept.push(line);
  }
  return kept.join("\n");
}

function stripLeadingSample(line, name) {
  let value = String(line || "").trim();
  value = value.replace(
    /^[^\n：:]{1,16}\s*[：:]\s*[.。…．・]+(?:\s*[.。…．・]+)*\s*(?=(?:[^\n：:]{1,16}\s*[：:])|【|\[|$)/,
    "",
  );
  if (name) {
    const echoed = new RegExp(`^(?:${escapeReg(name)}\\s*[：:]\\s*){2,}`);
    value = value.replace(echoed, `${name}：`);
  }
  return value.trim();
}

function isInstructionEcho(line) {
  if (/句式样例/.test(line)) return true;
  return /^(不要输出|不要写|这一句只写成|输出锁定|格式说明|格式要求|回复格式)/.test(line)
    && /思考|句式样例|表情编号|动作编号/.test(line);
}

function escapeReg(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
