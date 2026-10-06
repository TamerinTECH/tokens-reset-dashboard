const DAY = 24 * 60 * 60 * 1000;
const HORIZON = 400 * DAY;

// Accept an ISO string, unix seconds, or unix milliseconds. Store UTC ISO.
export function toIso(value, now = Date.now()) {
  if (value == null || value === "") {
    throw new Error("Missing resetsAt");
  }

  let ms;
  if (typeof value === "number" || /^\d+(\.\d+)?$/.test(String(value).trim())) {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error("resetsAt is not a time");
    ms = n < 1e12 ? n * 1000 : n;
  } else {
    ms = new Date(value).getTime();
    if (Number.isNaN(ms)) throw new Error("resetsAt is not a time");
  }

  if (ms < now - HORIZON) throw new Error("resetsAt is too far in the past");
  if (ms > now + HORIZON) throw new Error("resetsAt is too far in the future");
  return new Date(ms).toISOString();
}

export function windowLabel(minutes) {
  const n = Number(minutes);
  if (!Number.isFinite(n) || n <= 0) return "Window";
  if (n === 300) return "5-hour";
  if (n === 1440) return "Daily";
  if (n === 10080) return "Weekly";
  if (n % 1440 === 0) {
    const days = n / 1440;
    return days === 7 ? "Weekly" : `${days}-day`;
  }
  if (n % 60 === 0) return `${n / 60}-hour`;
  return `${n}-minute`;
}

const PLAN_NAMES = {
  plus: "Plus",
  pro: "Pro",
  prolite: "Pro Lite",
  max: "Max",
  team: "Team",
  business: "Business",
  enterprise: "Enterprise",
  free: "Free",
  go: "Go",
  supergrok: "SuperGrok",
};

export function planName(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const known = PLAN_NAMES[text.toLowerCase().replace(/[\s_-]+/g, "")];
  if (known) return known;
  if (text === text.toLowerCase()) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  return text;
}
