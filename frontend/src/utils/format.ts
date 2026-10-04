export const shortDate = (iso: string, locale?: string) =>
  new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });

export const dateTime = (iso: string, locale?: string) =>
  new Date(iso).toLocaleString(locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

type Translate = (key: "time.justNow" | "time.min" | "time.hours" | "time.days", values?: Record<string, number>) => string;

/** "5 min ago", "3 h ago", then a plain date: notifications read better relative to now. */
export function timeAgo(iso: string, t: Translate, locale?: string, now = Date.now()) {
  const mins = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return t("time.justNow");
  if (mins < 60) return t("time.min", { n: mins });
  if (mins < 24 * 60) return t("time.hours", { n: Math.round(mins / 60) });
  if (mins < 7 * 24 * 60) return t("time.days", { n: Math.round(mins / 1440) });
  return shortDate(iso, locale);
}
