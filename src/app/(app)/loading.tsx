// Shown instantly on tab switches while the server renders the page, so taps feel immediate.
export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true">
      <div className="h-8 w-48 rounded-lg bg-surface-2" />
      <div className="h-32 rounded-2xl bg-surface-2" />
      <div className="h-24 rounded-2xl bg-surface-2" />
      <div className="h-24 rounded-2xl bg-surface-2" />
    </div>
  );
}
