"use client";
import { useEffect, useRef, useState } from "react";
import { Button, Input, Notice } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import { normalizeBarcode } from "@/nutrition/barcode";

type Controls = { stop: () => void };

/**
 * Camera barcode scanner for EAN-13/EAN-8/UPC-A/UPC-E using ZXing (works in iOS Safari, Android Chrome and
 * desktop browsers). Falls back to manual entry when the camera is unavailable, denied or the page isn't HTTPS.
 */
export function Scanner({ onCode }: { onCode: (code: string, format?: string) => void }) {
  const { t } = useI18n();
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"starting" | "scanning" | "denied" | "insecure" | "error">("starting");
  const [manual, setManual] = useState("");
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    let controls: Controls | null = null;
    let cancelled = false;
    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setState("insecure");
        return;
      }
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]);
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 });
        if (cancelled || !video.current) return;
        controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } } }, video.current, (result, _err, c) => {
          if (!result) return;
          c.stop();
          try { navigator.vibrate?.(60); } catch {}
          onCode(result.getText(), BarcodeFormat[result.getBarcodeFormat()]);
        });
        if (cancelled) controls.stop();
        else setState("scanning");
      } catch (e) {
        const name = (e as Error).name;
        setState(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "error");
      }
    })();
    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [onCode]);

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
          <video ref={video} className="aspect-[4/3] w-full object-cover" muted playsInline />
          <div aria-hidden className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-xl border-2 border-white/80" />
          <p className="absolute inset-x-0 bottom-2 text-center text-sm text-white/90">{state === "starting" ? t("common.loading") : t("nutrition.scanning")}</p>
        </div>
      )}
      {state === "insecure" && <Notice tone="warning">{t("nutrition.cameraInsecure")}</Notice>}
      {(state === "denied" || state === "error") && <Notice tone="warning">{t("nutrition.cameraDenied")}</Notice>}
      <form onSubmit={submitManual} className="flex gap-2">
        <label htmlFor="manual-code" className="sr-only">{t("nutrition.manualBarcode")}</label>
        <Input id="manual-code" inputMode="numeric" placeholder={t("nutrition.manualBarcode")} value={manual} onChange={(e) => setManual(e.target.value.replace(/[^\d]/g, "").slice(0, 14))} />
        <Button type="submit" variant="secondary" disabled={manual.length < 8}>{t("common.search")}</Button>
      </form>
      {invalid && <p className="text-sm text-danger" role="alert">{t("nutrition.invalidBarcode")}</p>}
    </div>
  );
}
