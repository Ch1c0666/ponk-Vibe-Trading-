import { useTranslation } from "react-i18next";
import { LayoutDashboard } from "lucide-react";

export function Overview() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen p-6 lg:p-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="flex flex-col gap-4 border-b pb-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <LayoutDashboard className="h-3.5 w-3.5" />
              {t("overview.badge")}
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                {t("overview.title")}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                {t("overview.subtitle")}
              </p>
            </div>
          </div>
        </section>

        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center">
          <LayoutDashboard className="h-12 w-12 text-muted-foreground/40" />
          <p className="mt-4 text-sm text-muted-foreground">
            {t("overview.placeholder")}
          </p>
        </div>
      </div>
    </div>
  );
}
