import { PageHeader } from "@/components/ui";
import { pageCtx, todayIso } from "@/lib/ctx";
import { listPhotos } from "@/lib/data";
import { Photos } from "./photos";

export const dynamic = "force-dynamic";

export default async function PhotosPage() {
  const { user, t } = await pageCtx();
  return (
    <>
      <PageHeader back={{ href: "/progress", label: t("progress.title") }} title={t("photos.title")} subtitle={t("photos.tips")} />
      <Photos photos={await listPhotos(user.id)} today={todayIso()} />
    </>
  );
}
