export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function isWornInLast30Days(item) {
  if (!item || !item.lastWorn) return false;
  const time = new Date(item.lastWorn).getTime();
  if (isNaN(time)) return false;
  return Date.now() - time <= THIRTY_DAYS_MS;
}

export function formatLastWorn(dateStr) {
  if (!dateStr) return "Never worn";
  const time = new Date(dateStr).getTime();
  if (isNaN(time)) return "Never worn";
  const diffDays = Math.floor((Date.now() - time) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "Worn today";
  if (diffDays === 1) return "Worn yesterday";
  if (diffDays < 30) return `Worn ${diffDays}d ago`;
  return `Worn on ${new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export function describe(it) {
  if (!it) return "";
  if (it.name) return it.name;
  return `${it.color || ""} ${it.category || ""}`.trim();
}

export function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// The wardrobe as compact text for the server: "id | name | category | color | occasions" (no photos)
export const plainText = (v) => String(v ?? "").replace(/[|\r\n]/g, " ").replace(/\s+/g, " ").trim();
export const formatMoney = (n) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

// describe() made safe to put inside HTML (names are typed by people, including other members)
export const describeHtml = (it) => escapeHtml(describe(it));
