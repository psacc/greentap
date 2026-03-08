/**
 * Runtime locale detection for WhatsApp Web aria snapshot parsing.
 * Detects locale-dependent patterns (day names, relative dates, date format)
 * by probing the actual WhatsApp UI language, not navigator.language
 * (WhatsApp syncs language from the phone, ignoring browser locale).
 */

// Common WhatsApp UI language tags to probe
const PROBE_LOCALES = [
  "it-IT", "en-US", "en-GB", "fr-FR", "de-DE", "es-ES", "pt-BR", "pt-PT",
  "nl-NL", "pl-PL", "ru-RU", "ja-JP", "ko-KR", "zh-CN", "zh-TW",
  "ar-SA", "hi-IN", "tr-TR", "sv-SE", "da-DK", "nb-NO", "fi-FI",
  "cs-CZ", "ro-RO", "uk-UA", "el-GR", "hu-HU", "th-TH", "vi-VN",
  "id-ID", "ms-MY", "ca-ES", "hr-HR", "sk-SK", "bg-BG",
];

/**
 * Detect WhatsApp's actual UI locale by matching chat list content
 * against day names / relative dates from multiple locale candidates.
 * @param {import('playwright').Page} page
 * @returns {Promise<LocaleConfig>}
 */
export async function detectLocale(page) {
  // Get the chat list aria snapshot to find locale clues
  const ariaText = await page.locator(":root").ariaSnapshot();

  // Generate configs for all probe locales (in browser for Intl access)
  const configs = await page.evaluate((locales) => {
    return locales.map((lang) => {
      const dayFormatter = new Intl.DateTimeFormat(lang, { weekday: "long" });
      const dayNames = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(2025, 0, 6 + i);
        dayNames.push(dayFormatter.format(d).toLowerCase());
      }

      const relFormatter = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
      const yesterday = relFormatter.format(-1, "day");
      let today;
      try {
        const parts = relFormatter.formatToParts(0, "day");
        today = parts.map((p) => p.value).join("");
      } catch {
        today = relFormatter.format(0, "day");
      }

      const dateFormatter = new Intl.DateTimeFormat(lang, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const parts = dateFormatter.formatToParts(new Date(2024, 11, 25));
      const order = parts.filter((p) => p.type !== "literal").map((p) => p.type);
      const sep = parts.find((p) => p.type === "literal")?.value || "/";
      const escapedSep = sep.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const partRegex = order
        .map((t) => (t === "year" ? "\\d{4}" : "\\d{1,2}"))
        .join(escapedSep);

      return { language: lang, dayNames, yesterday, today, dateRegex: partRegex, dateSeparator: sep };
    });
  }, PROBE_LOCALES);

  // Score each config by counting matches in the aria text
  const ariaLower = ariaText.toLowerCase();
  let bestConfig = null;
  let bestScore = 0;

  for (const config of configs) {
    let score = 0;
    for (const day of config.dayNames) {
      if (ariaLower.includes(day)) score++;
    }
    if (ariaLower.includes(config.yesterday.toLowerCase())) score += 2;
    if (ariaLower.includes(config.today.toLowerCase())) score += 2;

    if (score > bestScore) {
      bestScore = score;
      bestConfig = config;
    }
  }

  // Fallback to navigator.language if no match
  if (!bestConfig || bestScore === 0) {
    const fallback = await page.evaluate(() => {
      const lang = navigator.language || "en-US";
      // Use the same generation logic
      const dayFormatter = new Intl.DateTimeFormat(lang, { weekday: "long" });
      const dayNames = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(2025, 0, 6 + i);
        dayNames.push(dayFormatter.format(d).toLowerCase());
      }
      const relFormatter = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
      const yesterday = relFormatter.format(-1, "day");
      let today;
      try {
        const parts = relFormatter.formatToParts(0, "day");
        today = parts.map((p) => p.value).join("");
      } catch {
        today = relFormatter.format(0, "day");
      }
      const dateFormatter = new Intl.DateTimeFormat(lang, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const parts = dateFormatter.formatToParts(new Date(2024, 11, 25));
      const order = parts.filter((p) => p.type !== "literal").map((p) => p.type);
      const sep = parts.find((p) => p.type === "literal")?.value || "/";
      const escapedSep = sep.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const partRegex = order
        .map((t) => (t === "year" ? "\\d{4}" : "\\d{1,2}"))
        .join(escapedSep);
      return { language: lang, dayNames, yesterday, today, dateRegex: partRegex, dateSeparator: sep };
    });
    return fallback;
  }

  return bestConfig;
}

/**
 * Build a time pattern regex from a locale config.
 * Matches HH:MM, date strings, day names, and relative dates.
 * @param {object} locale
 * @returns {RegExp}
 */
export function buildTimePattern(locale) {
  const dayAlternation = locale.dayNames.join("|");
  const escaped = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const yesterdayEsc = escaped(locale.yesterday);
  const todayEsc = escaped(locale.today);
  return new RegExp(
    `\\s+(?:(\\d{1,2}:\\d{2})|(${locale.dateRegex})|(${yesterdayEsc})|(${todayEsc})|(${dayAlternation}))$`,
    "i"
  );
}
