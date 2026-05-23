export function asArray(value, fallback = []) {
  if (!Array.isArray(value)) return fallback;
  return value.filter(Boolean);
}

export function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function escapeHtml(value, fallback = "") {
  return String(value || fallback)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function escapeAttr(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;");
}

export function safeSlug(value, fallback = "") {
  const text = String(value || "");
  return /^[a-z0-9][a-z0-9-]*$/.test(text) ? text : fallback;
}

export function safeCapabilityKey(value) {
  const text = String(value || "");
  return /^[a-z][a-zA-Z0-9]*$/.test(text) ? text : "";
}

export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}
