"use client";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import Loading from "./loading";

// Tab switches feel instant: the tapped tab lights up and a skeleton replaces the page right away,
// instead of waiting for the server's first bytes before anything on screen changes.
const Ctx = createContext<{ pending: string | null; go: (href: string) => void }>({ pending: null, go: () => {} });

export function NavPendingProvider({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => setPending(null), [path]);
  useEffect(() => {
    if (!pending) return;
    const id = setTimeout(() => setPending(null), 8000); // never get stuck on a failed navigation
    return () => clearTimeout(id);
  }, [pending]);
  return <Ctx.Provider value={{ pending, go: (href) => href !== path && setPending(href) }}>{children}</Ctx.Provider>;
}

export const useNavPending = () => useContext(Ctx);

export function PendingMain({ children }: { children: ReactNode }) {
  const { pending } = useNavPending();
  return pending ? <Loading /> : <>{children}</>;
}
