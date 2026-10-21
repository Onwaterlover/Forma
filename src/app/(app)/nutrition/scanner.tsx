"use client";
import { Camera } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, Input, Notice } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import { normalizeBarcode } from "@/nutrition/barcode";

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string; format: string }[]> };
const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];

async function zxingReader() {
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  return { reader: new BrowserMultiFormatReader(hints), BarcodeFormat };
}

function nativeDetector(): Detector | null {
  const D = (globalThis as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
  try { return D ? new D({ formats: FORMATS }) : null; } catch { return null; }
}

/** Draws an image or video frame into a canvas no larger than `max` px, the size decoders handle quickly. */
function toCanvas(src: CanvasImageSource & { width: number; height: number }, w: number, h: number, max = 1600) {
  const k = Math.min(1, max / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  c.getContext("2d", { willReadFrequently: true })!.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/** The middle band of the frame (where the guide box is): less to search, so decoding is faster. */
function centerBand(v: HTMLVideoElement) {
  const w = v.videoWidth, h = v.videoHeight;
  const cw = Math.round(w * 0.9), ch = Math.round(h * 0.45);
  const k = Math.min(1, 1000 / cw);
  const c = document.createElement("canvas");
  c.width = Math.round(cw * k);
  c.height = Math.round(ch * k);
  c.getContext("2d", { willReadFrequently: true })!.drawImage(v, (w - cw) / 2, (h - ch) / 2, cw, ch, 0, 0, c.width, c.height);
  return c;
}

/**
 * Barcode scanner (EAN-13/EAN-8/UPC-A/UPC-E). Uses the browser's own BarcodeDetector where available
 * (Android Chrome) and ZXing elsewhere (iPhone). The camera is always released when the scanner closes,
 * the app goes to the background, or a code is found. "Photo of the barcode" uses the phone's camera app,
 * which focuses better on small codes; manual entry always works.
 */
export function Scanner({ onCode }: { onCode: (code: string, format?: string) => void }) {
  const { t } = useI18n();
  const video = useRef<HTMLVideoElement>(null);
  const photo = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"starting" | "scanning" | "paused" | "denied" | "insecure" | "error">("starting");
  const [run, setRun] = useState(0);
  const [manual, setManual] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const found = useRef(onCode);
  found.current = onCode;

  useEffect(() => {
    if (state === "paused") return;
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const stop = () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
      if (video.current) video.current.srcObject = null;
    };
    const hit = (code: string, format?: string) => {
      stop();
      try { navigator.vibrate?.(60); } catch {}
      found.current(code, format);
    };
    // Leaving the app (or locking the phone) releases the camera; scanning resumes on request.
    const onHide = () => { if (document.visibilityState === "hidden") { stop(); setState("paused"); } };
    document.addEventListener("visibilitychange", onHide);

    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return setState("insecure");
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (stopped || !video.current) return stop();
        const track = stream.getVideoTracks()[0];
        try { await track?.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }); } catch {}
        video.current.srcObject = stream;
        await video.current.play().catch(() => {});
        setState("scanning");

        const native = nativeDetector();
        const z = native ? null : await zxingReader();
        let n = 0;
        const tick = async () => {
          const v = video.current;
          if (stopped || !v) return;
          if (v.readyState >= 2 && v.videoWidth) {
            try {
              if (native) {
                const r = (await native.detect(v))[0];
                if (r) return hit(r.rawValue, r.format.toUpperCase());
              } else if (z) {
                // Mostly the band behind the guide box; every fourth try the whole frame.
                const src = ++n % 4 === 0 ? toCanvas(v, v.videoWidth, v.videoHeight, 1280) : centerBand(v);
                const r = z.reader.decodeFromCanvas(src);
                return hit(r.getText(), z.BarcodeFormat[r.getBarcodeFormat()]);
              }
            } catch { /* no code in this frame */ }
          }
          timer = setTimeout(tick, native ? 120 : 60);
        };
        tick();
      } catch (e) {
        stop();
        const name = (e as Error).name;
        setState(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "error");
      }
    })();
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      stop();
    };
  }, [run, state === "paused"]);

  const fromPhoto = async (file: File) => {
    setPhotoFailed(false);
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      const canvas = toCanvas(bmp, bmp.width, bmp.height);
      const native = nativeDetector();
      if (native) {
        const r = (await native.detect(canvas))[0];
        if (r) return onCode(r.rawValue, r.format.toUpperCase());
      } else {
        const z = await zxingReader();
        const r = z.reader.decodeFromCanvas(canvas);
        return onCode(r.getText(), z.BarcodeFormat[r.getBarcodeFormat()]);
      }
    } catch { /* fall through */ }
    setPhotoFailed(true);
  };

  const submitManual = (ev: React.FormEvent) => {
    ev.preventDefault();
    const code = normalizeBarcode(manual);
    if (!code) return setInvalid(true);
    setInvalid(false);
    onCode(code);
  };

  return (
    <div className="space-y-4">
      {(state === "starting" || state === "scanning") && (
        <div className="relative overflow-hidden rounded-2xl bg-black">
          <video ref={video} className="aspect-[4/3] w-full object-cover" muted playsInline autoPlay />
          <div aria-hidden className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-xl border-2 border-white/80" />
          <p className="absolute inset-x-0 bottom-2 text-center text-sm text-white/90">{state === "starting" ? t("common.loading") : t("nutrition.scanning")}</p>
        </div>
      )}
      {state === "paused" && <Button full variant="secondary" onClick={() => { setState("starting"); setRun((n) => n + 1); }}>{t("nutrition.scanResume")}</Button>}
      {state === "insecure" && <Notice tone="warning">{t("nutrition.cameraInsecure")}</Notice>}
      {(state === "denied" || state === "error") && <Notice tone="warning">{t("nutrition.cameraDenied")}</Notice>}

      <input ref={photo} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) fromPhoto(f); }} />
      <Button full variant="secondary" onClick={() => photo.current?.click()}><Camera size={18} aria-hidden />{t("nutrition.scanPhoto")}</Button>
      {photoFailed && <p className="text-sm text-warning" role="alert">{t("nutrition.scanPhotoFailed")}</p>}

      <form onSubmit={submitManual} className="flex gap-2">
        <label htmlFor="manual-code" className="sr-only">{t("nutrition.manualBarcode")}</label>
        <Input id="manual-code" inputMode="numeric" placeholder={t("nutrition.manualBarcode")} value={manual} onChange={(e) => setManual(e.target.value.replace(/[^\d]/g, "").slice(0, 14))} />
        <Button type="submit" variant="secondary" disabled={manual.length < 8}>{t("common.search")}</Button>
      </form>
      {invalid && <p className="text-sm text-danger" role="alert">{t("nutrition.invalidBarcode")}</p>}
    </div>
  );
}
