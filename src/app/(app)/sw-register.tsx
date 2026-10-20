"use client";
import { useEffect } from "react";

export function SwRegister() {
  useEffect(() => {
    // Service workers need a secure context (HTTPS or localhost); elsewhere the app simply works online-only.
    if ("serviceWorker" in navigator && window.isSecureContext && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
