import assert from "node:assert/strict";
import test from "node:test";
import { prepareSpokenReply, sanitizeModelReply } from "./reply-text.js";

test("洗净思考块、句式样例和照抄的名字", () => {
  const leaked = "句式样例： 初棠：...... </think> 初棠：这条线今晚还亮着，你来得刚好。";
  const prepared = prepareSpokenReply(leaked, "初棠");
  assert.equal(prepared.line, "这条线今晚还亮着，你来得刚好。");
  assert.equal(prepared.expression, "");
  assert.equal(prepared.action, "");

  const tagged = prepareSpokenReply(
    "<think>先想该用哪张脸</think>【expr_smile】【pose_wave】这条线今晚还亮着，你来得刚好。",
    "初棠",
  );
  assert.equal(tagged.line, "这条线今晚还亮着，你来得刚好。");
  assert.equal(tagged.expression, "expr_smile");
  assert.equal(tagged.action, "pose_wave");

  const sample = prepareSpokenReply(
    "句式样例：初棠：……【expr_shy】【pose_stand】这条线今晚还亮着，你来得刚好。",
    "初棠",
  );
  assert.equal(sample.line, "这条线今晚还亮着，你来得刚好。");
  assert.equal(sample.expression, "expr_shy");
  assert.equal(sample.action, "pose_stand");
});

test("没写完的思考标签和只剩残字时，当成空回复", () => {
  assert.equal(prepareSpokenReply("</think>颗。", "星璇").line, "");
  assert.equal(prepareSpokenReply("<think>还在想", "星璇").line, "");
  assert.equal(prepareSpokenReply("推理到一半 </think", "星璇").line, "");
  assert.equal(sanitizeModelReply("＜think＞还在想＜/think＞"), "");
  assert.equal(prepareSpokenReply("【expr_smile】【pose_wave】", "初棠").line, "");
  assert.equal(prepareSpokenReply("嗯。", "初棠").line, "嗯。");
  assert.equal(prepareSpokenReply("【expr_think】【pose_sit】在。", "初棠").line, "在。");
});

test("云端不带编号的台词仍保留，名字前缀只去掉一层", () => {
  const plain = prepareSpokenReply("暖璃：这句话我记下了。", "暖璃");
  assert.equal(plain.line, "这句话我记下了。");
  assert.equal(plain.expression, "");
  assert.equal(plain.action, "");
  const half = prepareSpokenReply("[expr_smile][pose_point]门还开着。", "暖璃");
  assert.equal(half.line, "门还开着。");
  assert.equal(half.expression, "expr_smile");
  assert.equal(half.action, "pose_point");
  const unknown = prepareSpokenReply("【expr_nope】【pose_dance】先坐下。", "暖璃");
  assert.equal(unknown.line, "先坐下。");
  assert.equal(unknown.expression, "");
  assert.equal(unknown.action, "");
});
