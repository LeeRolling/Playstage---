import { clone } from "./util.js";

export function publicModel(model) {
  return {
    provider: model.provider === "cloud" ? "cloud" : "local",
    localBaseUrl: model.localBaseUrl || "http://127.0.0.1:11434/v1",
    localModel: model.localModel || "",
    cloudBaseUrl: model.cloudBaseUrl || "",
    cloudModel: model.cloudModel || "",
    cloudApiKeySet: Boolean(model.cloudApiKey),
  };
}

export function updateModel(library, fields) {
  const next = clone(library);
  const model = next.model;
  if (fields.provider != null) {
    if (fields.provider !== "local" && fields.provider !== "cloud") {
      throw new Error("模型只能选本机，或你自己的云端接口。");
    }
    model.provider = fields.provider;
  }
  if (fields.localBaseUrl != null) model.localBaseUrl = String(fields.localBaseUrl).trim();
  if (fields.localModel != null) model.localModel = String(fields.localModel).trim();
  if (fields.cloudBaseUrl != null) model.cloudBaseUrl = String(fields.cloudBaseUrl).trim();
  if (fields.cloudModel != null) model.cloudModel = String(fields.cloudModel).trim();
  if (fields.clearCloudApiKey) model.cloudApiKey = "";
  else if (String(fields.cloudApiKey ?? "").trim()) model.cloudApiKey = String(fields.cloudApiKey).trim();
  return next;
}
