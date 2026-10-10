/**
 * 裁好的图按原图种类留下。头像和全身图一律 PNG，透明底不会被涂成黑底。
 */

export function preferredImageMime(sourceType, kind) {
  const type = String(sourceType || "").toLowerCase();
  if (kind === "avatar" || kind === "full") return "image/png";
  if (type.includes("png") || type.includes("webp")) return "image/png";
  return "image/jpeg";
}
