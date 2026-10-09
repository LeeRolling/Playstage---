import { randomUUID } from "node:crypto";

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function uid(prefix) {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function requireText(value, message) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(message);
  return text;
}
