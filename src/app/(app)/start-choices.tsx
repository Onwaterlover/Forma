import { ClipboardList, Sparkles, UtensilsCrossed } from "lucide-react";
import { chooseStart } from "@/app/actions/general";
import type { T } from "@/i18n";

export function StartChoices({ t }: { t: T }) {
  const items = [
    { path: "plan" as const, icon: Sparkles, title: t("start.plan"), hint: t("start.planHint") },
    { path: "have" as const, icon: ClipboardList, title: t("start.have"), hint: t("start.haveHint") },
    { path: "food" as const, icon: UtensilsCrossed, title: t("start.food"), hint: t("start.foodHint") },
  ];
  return (
    <section aria-labelledby="start-title" className="mb-8">
      <h2 id="start-title" className="text-xl font-semibold tracking-tight">{t("start.title")}</h2>
      <p className="mb-4 mt-1 text-sm text-muted">{t("start.subtitle")}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {items.map(({ path, icon: Icon, title, hint }) => (
          <form key={path} action={chooseStart.bind(null, path)}>
            <button type="submit" className="flex h-full w-full flex-col items-start gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 text-left transition-colors hover:border-accent hover:bg-accent-soft">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent"><Icon size={20} aria-hidden /></span>
              <span>
                <span className="block font-medium">{title}</span>
                <span className="mt-1 block text-sm text-muted">{hint}</span>
              </span>
            </button>
          </form>
        ))}
      </div>
    </section>
  );
}
