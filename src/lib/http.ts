/** CSRF guard for JSON route handlers: browsers always send Origin on cross-site POST/PUT/DELETE. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return req.method === "GET";
  try {
    const originHost = new URL(origin).host;
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (originHost === host) return true;
    // Same list as next.config.ts serverActions.allowedOrigins (reverse proxies such as Tailscale serve).
    const allowed = process.env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
    return allowed.includes(originHost);
  } catch {
    return false;
  }
}
