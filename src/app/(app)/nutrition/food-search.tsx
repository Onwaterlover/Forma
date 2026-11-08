"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/client";
import type { Product } from "@/lib/data";
import { ProductList } from "./add-food";

/**
 * Same search as adding food: own + basic foods as you type, then Open Food Facts for 3+ letters.
 * `found` is null while the first answer is on its way.
 */
export function useFoodSearch(q: string) {
  const [found, setFound] = useState<Product[] | null>(null);
  const [remote, setRemote] = useState<Product[] | null>(null);
  const [remoteState, setRemoteState] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    setFound(null);
    setRemote(null);
    setRemoteState("idle");
    if (q.trim().length < 2) return;
    let live = true;
    const h = setTimeout(async () => {
      const r = await fetch(`/api/food/search?q=${encodeURIComponent(q)}`).then((x) => x.json()).catch(() => ({ products: [] }));
      if (!live) return;
      const have: Product[] = r.products ?? [];
      setFound(have);
      if (q.trim().length < 3) return;
      setRemoteState("loading");
      const o = await fetch(`/api/food/search?q=${encodeURIComponent(q)}&remote=1`).then((x) => x.json()).catch(() => ({ error: "x" }));
      if (!live) return;
      if (o.error) return setRemoteState("error");
      setRemoteState("idle");
      setRemote((o.products ?? []).filter((p: Product) => !have.some((x) => x.id === p.id)));
    }, 450);
    return () => { live = false; clearTimeout(h); };
  }, [q]);

  return { found, remote, remoteState, all: [...(found ?? []), ...(remote ?? [])] };
}

/** Results for `q` (2+ letters) that always say what is happening: searching, found (tap to pick), or nothing. */
export function SearchResults({ q, onPick }: { q: string; onPick: (p: Product) => void }) {
  const { t } = useI18n();
  const { found, remoteState, all } = useFoodSearch(q);
  if (q.trim().length < 2) return null;
  return (
    <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-border px-3">
      {found === null ? <p className="py-3 text-sm text-muted">{t("common.loading")}</p>
        : !all.length ? <p className="py-3 text-sm text-muted">{remoteState === "loading" ? t("nutrition.searchingRemote") : remoteState === "error" ? t("nutrition.unavailable") : t("nutrition.nothingFound")}</p>
        : (
          <>
            <ProductList items={all} onPick={onPick} />
            {remoteState === "loading" && <p className="py-2 text-center text-xs text-muted">{t("nutrition.searchingRemote")}</p>}
          </>
        )}
    </div>
  );
}
