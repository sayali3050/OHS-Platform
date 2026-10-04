import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/misc";
import { useT } from "@/i18n";

export function ReportSubmitted({ reference, detailPath, anonymous, onAnother }: {
  reference: string; detailPath: string | null; anonymous?: boolean; onAnother: () => void;
}) {
  const { t } = useT();
  return (
    <Panel className="mx-auto max-w-xl p-6 text-center sm:p-10" role="status">
      <CheckCircle2 className="mx-auto h-14 w-14 text-safe" aria-hidden />
      <h1 className="mt-4 text-[28px] font-bold">{t("sent.title")}</h1>
      <p className="mt-2 text-muted">{t("sent.refIs")}</p>
      <p className="mt-1 font-display text-3xl font-bold tabular-nums">{reference}</p>
      <p className="mx-auto mt-4 max-w-sm text-muted">
        {anonymous ? t("sent.anonBody") : t("sent.body")}
      </p>
      <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
        {detailPath && <Button asChild variant="secondary"><Link to={detailPath}>{t("sent.view")}</Link></Button>}
        <Button variant="outline" onClick={onAnother}>{t("sent.another")}</Button>
        <Button asChild variant="ghost"><Link to="/">{t("sent.home")}</Link></Button>
      </div>
    </Panel>
  );
}
