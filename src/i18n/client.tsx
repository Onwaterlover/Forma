"use client";
import { createContext, useContext, useMemo } from "react";
import { translator, type Locale, type T } from "./index";

const Ctx = createContext<{ locale: Locale; t: T }>({ locale: "pl", t: translator("pl") });

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, t: translator(locale) }), [locale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
