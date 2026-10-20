"use client";
import { Camera, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Choices, useToast } from "@/components/client";
import { Card, cx, Empty, Input, Notice, Select } from "@/components/ui";
import { fmtDate } from "@/i18n";
import { useI18n } from "@/i18n/client";
import type { PhotoMeta } from "@/lib/data";

type Pose = PhotoMeta["pose"];
const POSES: Pose[] = ["front", "side", "back"];
const MAX_SIDE = 1600;

/** Downscale and re-encode in the browser: smaller uploads, and EXIF data (incl. GPS) is dropped. */
async function prepare(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * scale);
  const height = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
  if (!blob) throw new Error("encode");
  return { blob, width, height };
}

export function Photos({ photos, today }: { photos: PhotoMeta[]; today: string }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pose, setPose] = useState<Pose>("front");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const byDate = useMemo(() => {
    const m = new Map<string, PhotoMeta[]>();
    for (const p of photos) m.set(p.date, [...(m.get(p.date) ?? []), p]);
    return [...m.entries()];
  }, [photos]);
  const dates = byDate.map(([d]) => d);
  const [cmp, setCmp] = useState<{ a: string; b: string; pose: Pose }>({ a: dates.at(-1) ?? "", b: dates[0] ?? "", pose: "front" });

  const lastDays = dates[0] ? Math.round((Date.parse(today) - Date.parse(dates[0])) / 86_400_000) : null;

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const { blob, width, height } = await prepare(file);
      const fd = new FormData();
      fd.append("file", blob, "photo.jpg");
      fd.append("date", date);
      fd.append("pose", pose);
      fd.append("note", note);
      fd.append("width", String(width));
      fd.append("height", String(height));
      const res = await fetch("/api/photos", { method: "POST", body: fd });
      if (res.status === 413) return toast({ text: t("photos.tooLarge") });
      if (!res.ok) return toast({ text: t("photos.invalid") });
      toast({ text: t("photos.saved") });
      setNote("");
      // Next pose in the usual front → side → back sequence.
      setPose((p) => (p === "front" ? "side" : p === "side" ? "back" : p));
      router.refresh();
    } catch {
      toast({ text: t("photos.invalid") });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const remove = async (id: string) => {
    await fetch(`/api/photos/${id}`, { method: "DELETE" });
    router.refresh();
  };

  const find = (d: string, p: Pose) => photos.find((x) => x.date === d && x.pose === p);

  return (
    <div className="space-y-4">
      {lastDays !== null && (
        <Notice tone={lastDays >= 7 ? "accent" : "neutral"}>
          {lastDays === 0 ? t("photos.lastToday") : t("photos.last", { n: lastDays })}
          {lastDays >= 7 && <> · {t("photos.reminder")}</>}
        </Notice>
      )}

      <Card className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-medium">{t("photos.poseLabel")}</p>
          <Choices<Pose> name={t("photos.poseLabel")} columns={3} value={pose} onChange={setPose} options={POSES.map((p) => ({ value: p, label: t(`photos.pose.${p}`) }))} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm"><span className="block font-medium">{t("photos.date")}</span>
            <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm"><span className="block font-medium">{t("photos.note")}</span>
            <Input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        <label className={cx("flex h-14 cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent font-medium text-accent-contrast hover:bg-accent-hover", busy && "pointer-events-none opacity-60")}>
          <Camera size={20} aria-hidden />{busy ? t("photos.uploading") : t("photos.pick")}
          {/* No "capture" attribute: phones then offer both the camera and the photo gallery. */}
          <input ref={input} type="file" accept="image/*" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} disabled={busy} />
        </label>
        <p className="text-xs text-muted">{t("photos.pickHint")}</p>
      </Card>

      {dates.length >= 2 && (
        <Card className="space-y-3">
          <h2 className="font-semibold">{t("photos.compare")}</h2>
          <div className="grid grid-cols-3 gap-2">
            <Select aria-label={t("photos.before")} value={cmp.a} onChange={(e) => setCmp({ ...cmp, a: e.target.value })}>
              {dates.map((d) => <option key={d} value={d}>{fmtDate(locale, d)}</option>)}
            </Select>
            <Select aria-label={t("photos.after")} value={cmp.b} onChange={(e) => setCmp({ ...cmp, b: e.target.value })}>
              {dates.map((d) => <option key={d} value={d}>{fmtDate(locale, d)}</option>)}
            </Select>
            <Select aria-label={t("photos.poseLabel")} value={cmp.pose} onChange={(e) => setCmp({ ...cmp, pose: e.target.value as Pose })}>
              {POSES.map((p) => <option key={p} value={p}>{t(`photos.pose.${p}`)}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[{ d: cmp.a, l: t("photos.before") }, { d: cmp.b, l: t("photos.after") }].map(({ d, l }) => {
              const ph = find(d, cmp.pose);
              return (
                <figure key={l} className="space-y-1">
                  {ph ? <img src={`/api/photos/${ph.id}`} alt={`${l} ${fmtDate(locale, d)}`} className="aspect-[3/4] w-full rounded-xl bg-surface-2 object-cover" /> : <div className="aspect-[3/4] rounded-xl bg-surface-2" />}
                  <figcaption className="text-center text-xs text-muted">{l} · {fmtDate(locale, d)}</figcaption>
                </figure>
              );
            })}
          </div>
        </Card>
      )}

      {byDate.length === 0 ? (
        <Empty>{t("photos.none")}</Empty>
      ) : (
        byDate.map(([d, list]) => (
          <Card key={d} className="space-y-2">
            <h3 className="font-semibold">{fmtDate(locale, d, { weekday: "short", day: "numeric", month: "long", year: "numeric" })}</h3>
            <div className="grid grid-cols-3 gap-2">
              {list.map((p) => (
                <figure key={p.id} className="relative">
                  <img src={`/api/photos/${p.id}`} alt={`${t(`photos.pose.${p.pose}`)} ${fmtDate(locale, d)}`} loading="lazy" className="aspect-[3/4] w-full rounded-xl bg-surface-2 object-cover" />
                  <figcaption className="mt-1 text-xs text-muted">{t(`photos.pose.${p.pose}`)}{p.note ? ` · ${p.note}` : ""}</figcaption>
                  <button type="button" onClick={() => remove(p.id)} aria-label={t("photos.delete")}
                    className="absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-full bg-black/55 text-white hover:bg-black/70">
                    <Trash2 size={14} />
                  </button>
                </figure>
              ))}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
