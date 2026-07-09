const STORAGE_KEY = "envy_skin_url_params";

function safeParseStored(): Record<string, string> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string" && v.trim()) out[k] = v.trim();
    }
    return out;
  } catch {
    return {};
  }
}

function parseQueryString(search: string): Record<string, string> {
  const q = search.startsWith("?") ? search.slice(1) : search;
  const out: Record<string, string> = {};
  new URLSearchParams(q).forEach((value, key) => {
    if (value.trim()) out[key] = value.trim();
  });
  return out;
}

/**
 * Lê query da URL (`?a=1`) e, se existir, query após `#` (`#/path?a=1`).
 * Mescla com sessionStorage para manter parâmetros em landing → checkout → PIX.
 */
export function mergeUrlParamsFromLocation(): Record<string, string> {
  const fromSearch = parseQueryString(window.location.search);
  let fromHash: Record<string, string> = {};
  const hash = window.location.hash;
  const qi = hash.indexOf("?");
  if (qi >= 0) {
    fromHash = parseQueryString(hash.slice(qi));
  }
  const fromUrl = { ...fromHash, ...fromSearch };

  const prev = safeParseStored();

  if (Object.keys(fromUrl).length === 0) {
    return prev;
  }

  const merged = { ...prev, ...fromUrl };
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  return merged;
}

/** Mapeia aliases comuns (ex.: camelCase) para o formato que a Fruitfy documenta. */
export function toFruitfyUtmPayload(params: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = { ...params };

  const aliases: Record<string, string> = {
    utmSource: "utm_source",
    utmMedium: "utm_medium",
    utmCampaign: "utm_campaign",
    utmContent: "utm_content",
    utmTerm: "utm_term",
    source: "utm_source",
    medium: "utm_medium",
    campaign: "utm_campaign",
    content: "utm_content",
    term: "utm_term",
  };

  for (const [key, snake] of Object.entries(aliases)) {
    const v = params[key];
    if (v && !out[snake]) out[snake] = v;
  }

  return out;
}
