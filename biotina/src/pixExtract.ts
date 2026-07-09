/** Extrai código PIX copia-e-cola e QR da resposta da Fruitfy (formato pode variar). */

const PIX_EMV_START = /^000201/;

const DIRECT_PIX_KEYS = [
  "pix_copy_paste",
  "pixCopyPaste",
  "pix_copia_cola",
  "pix_copia_e_cola",
  "codigo_pix",
  "copy_paste",
  "copyPaste",
  "qr_code_text",
  "qrCodeText",
  "emv",
  "payload",
  "brcode",
  "br_code",
  "code",
  "pix_code",
  "pixCode",
];

const DIRECT_QR_KEYS = [
  "qr_code_base64",
  "qrCodeBase64",
  "qrcode_base64",
  "qr_code_image",
  "qrCodeImage",
  "qrcode",
  "qr_code",
  "qrCode",
  "image_base64",
  "imageBase64",
];

export type PixExtractResult = {
  pixCode: string;
  qrCodeImage?: string;
  orderId?: string;
  amount: number;
  raw: unknown;
};

function unwrapData(payload: unknown): Record<string, unknown> {
  if (payload == null) return {};
  let root: unknown = payload;
  if (typeof root === "object" && root !== null && "data" in root) {
    root = (root as { data: unknown }).data;
  }
  if (typeof root === "string") {
    try {
      root = JSON.parse(root) as unknown;
    } catch {
      return {};
    }
  }
  if (Array.isArray(root) && root[0] && typeof root[0] === "object") {
    root = root[0];
  }
  if (typeof root !== "object" || root === null) return {};
  return root as Record<string, unknown>;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return undefined;
}

function mergeNested(obj: Record<string, unknown>): Record<string, unknown> {
  const nestedKeys = ["pix", "payment", "order", "charge", "transaction", "checkout", "gateway"];
  let merged: Record<string, unknown> = { ...obj };
  for (const k of nestedKeys) {
    const inner = obj[k];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      merged = { ...merged, ...(inner as Record<string, unknown>) };
    }
  }
  return merged;
}

function findEmvDeep(value: unknown, depth = 0): string | undefined {
  if (depth > 14) return undefined;
  if (typeof value === "string") {
    const t = value.trim();
    if (t.length >= 50 && PIX_EMV_START.test(t)) return t;
    return undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const f = findEmvDeep(item, depth + 1);
      if (f) return f;
    }
    return undefined;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) {
      const f = findEmvDeep(v, depth + 1);
      if (f) return f;
    }
  }
  return undefined;
}

function findBase64QrDeep(value: unknown, depth = 0): string | undefined {
  if (depth > 14) return undefined;
  if (typeof value === "string") {
    const t = value.trim();
    if (t.length > 200 && /^[A-Za-z0-9+/=\s]+$/.test(t.replace(/\s/g, ""))) {
      const compact = t.replace(/\s/g, "");
      if (compact.startsWith("iVBOR") || compact.length > 500) return compact;
    }
    return undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const f = findBase64QrDeep(item, depth + 1);
      if (f) return f;
    }
    return undefined;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      const key = k.toLowerCase();
      if (key.includes("qr") || key.includes("base64") || key.includes("image")) {
        if (typeof v === "string" && v.length > 50) return v.trim().replace(/\s/g, "");
      }
      const f = findBase64QrDeep(v, depth + 1);
      if (f) return f;
    }
  }
  return undefined;
}

function pickAmount(obj: Record<string, unknown>): number {
  const keys = [
    "amount",
    "total_gross_amount",
    "total_net_amount",
    "value",
    "total",
    "total_amount",
  ];
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  }
  return 0;
}

function pickOrderId(obj: Record<string, unknown>): string | undefined {
  const isUuid = (s: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  for (const k of ["order_uuid", "uuid", "order_id", "id"]) {
    const v = obj[k];
    if (typeof v === "string" && isUuid(v)) return v;
  }
  const keys = ["order_uuid", "uuid", "order_id", "id", "short_id"];
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

/** UUID do pedido para GET /api/order/{order} (Fruitfy). */
export function pickOrderUuidForApi(obj: unknown): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const o = obj as Record<string, unknown>;
  const direct = o.uuid ?? o.order_uuid;
  if (typeof direct === "string" && direct.length > 8) return direct;
  const order = o.order;
  if (order && typeof order === "object") {
    const inner = order as Record<string, unknown>;
    const id = inner.uuid ?? inner.id;
    if (typeof id === "string" && id.length > 8) return id;
  }
  return pickOrderId(o);
}

export function extractPixFromFruitfyPayload(payload: unknown): PixExtractResult {
  const flat = mergeNested(unwrapData(payload));
  let pixCode =
    pickString(flat, DIRECT_PIX_KEYS) ||
    findEmvDeep(flat) ||
    findEmvDeep(payload);

  let qrCodeImage =
    pickString(flat, DIRECT_QR_KEYS) || findBase64QrDeep(flat) || findBase64QrDeep(payload);

  const amount = pickAmount(flat);
  const orderId = pickOrderId(flat);

  if (!pixCode || typeof pixCode !== "string") {
    const debugKeys =
      flat && typeof flat === "object" ? Object.keys(flat).slice(0, 25).join(", ") : "";
    throw new Error(
      debugKeys
        ? `A Fruitfy retornou sucesso, mas não encontramos o código PIX na resposta (campos: ${debugKeys}).`
        : "A resposta da Fruitfy não retornou o código PIX copia e cola."
    );
  }

  return {
    pixCode,
    qrCodeImage,
    orderId,
    amount,
    raw: flat,
  };
}
