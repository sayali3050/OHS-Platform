import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";

export default function NotFound() {
  const { t } = useT();
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <p className="font-display text-7xl font-bold text-muted">404</p>
        <h1 className="mt-2 text-2xl font-bold">{t("notFound.title")}</h1>
        <p className="mt-2 text-muted">{t("notFound.body")}</p>
        <Button className="mt-6" asChild><Link to="/">{t("notFound.action")}</Link></Button>
      </div>
    </div>
  );
}
