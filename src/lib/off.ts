import "server-only";
import { mapOffProduct, OFF_FIELDS, type ProductDraft } from "@/nutrition/off";
import { cachedSearch, productByBarcode, productsByBarcodes, storeSearch, upsertOffProduct, type Product } from "./data";

// Open Food Facts access. All users share this server's IP, so we stay well under the documented limits
// (product reads 15/min, search 10/min per IP), cache everything, and never search on keystrokes.

const BASE = "https://world.openfoodfacts.org";
const UA = `Forma/0.1 (private self-hosted app; ${process.env.OFF_CONTACT ?? "no-contact-configured"})`;
const PRODUCT_TTL = 30 * 86_400_000;
const SEARCH_TTL = 24 * 3_600_000;

class Bucket {
  private stamps: number[] = [];
  constructor(private max: number, private windowMs = 60_000) {}
  take(): boolean {
    const now = Date.now();
    this.stamps = this.stamps.filter((t) => now - t < this.windowMs);
    if (this.stamps.length >= this.max) return false;
    this.stamps.push(now);
    return true;
  }
}

const g = globalThis as unknown as { __offBuckets?: { product: Bucket; search: Bucket } };
const buckets = (g.__offBuckets ??= { product: new Bucket(12), search: new Bucket(8) });

export type OffError = "rate_limited" | "unavailable" | "not_found";

async function get(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (res.status === 404) return null;
  if (res.status === 429 || res.status === 503) throw new Error("rate_limited");
  if (!res.ok) throw new Error("unavailable");
  return res.json();
}

export async function lookupBarcode(userId: string, barcode: string, lang: "pl" | "de" | "en"): Promise<{ product: Product; warnings: ProductDraft["warnings"] } | { error: OffError }> {
  const cached = productByBarcode(userId, barcode);
  if (cached && (cached.source === "custom" || (cached.fetched_at && Date.now() - Date.parse(cached.fetched_at) < PRODUCT_TTL))) {
    return { product: cached, warnings: [] };
  }
  if (!buckets.product.take()) return cached ? { product: cached, warnings: [] } : { error: "rate_limited" };
  try {
    const data = (await get(`${BASE}/api/v2/product/${encodeURIComponent(barcode)}?fields=${OFF_FIELDS}&lc=${lang}`)) as { status?: number; product?: unknown } | null;
    if (!data || data.status !== 1) return cached ? { product: cached, warnings: [] } : { error: "not_found" };
    const draft = mapOffProduct({ ...(data.product as object), code: barcode }, lang);
    if (!draft) return { error: "not_found" };
    upsertOffProduct(draft);
    return { product: productByBarcode(userId, barcode)!, warnings: draft.warnings };
  } catch (e) {
    if (cached) return { product: cached, warnings: [] };
    return { error: (e as Error).message === "rate_limited" ? "rate_limited" : "unavailable" };
  }
}

export async function searchRemote(userId: string, query: string, lang: "pl" | "de" | "en"): Promise<{ products: Product[] } | { error: OffError }> {
  const q = query.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 80);
  if (q.length < 2) return { products: [] };
  const key = `${lang}:${q}`;
  const hit = cachedSearch(key, SEARCH_TTL);
  if (hit) return { products: productsByBarcodes(userId, hit) };
  if (!buckets.search.take()) return { error: "rate_limited" };
  try {
    const url = `${BASE}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=24&lc=${lang}&fields=${OFF_FIELDS}`;
    const data = (await get(url)) as { products?: unknown[] } | null;
    const drafts = (data?.products ?? []).map((p) => mapOffProduct(p, lang)).filter((d): d is ProductDraft => !!d && !d.warnings.includes("no_nutrition"));
    for (const d of drafts) upsertOffProduct(d);
    const codes = drafts.map((d) => d.barcode);
    storeSearch(key, codes);
    return { products: productsByBarcodes(userId, codes) };
  } catch (e) {
    return { error: (e as Error).message === "rate_limited" ? "rate_limited" : "unavailable" };
  }
}
