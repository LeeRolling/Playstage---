/**
 * 裁好的图按原图种类留下。头像、全身图、思考立绘、表情和动作一律 PNG，透明底不会被涂成黑底。
 */

export function preferredImageMime(sourceType, kind) {
  const type = String(sourceType || "").toLowerCase();
  if (kind === "avatar" || kind === "full" || kind === "thinking" || kind === "expression" || kind === "action") return "image/png";
  if (type.includes("png") || type.includes("webp")) return "image/png";
  return "image/jpeg";
}
