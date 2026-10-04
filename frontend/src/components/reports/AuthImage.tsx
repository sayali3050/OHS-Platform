import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { Skeleton } from "@/components/ui/misc";
import { useT } from "@/i18n";
import { api } from "@/services/api";
import type { AttachmentRef } from "@/types/reports";

/** Evidence is only served to people allowed to see the report, so it's fetched with the session token. */
export function AuthImage({ attachment, className }: { attachment: AttachmentRef; className?: string }) {
  const { t } = useT();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let alive = true;
    api.attachment(attachment.id)
      .then((blob) => { if (alive) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); } })
      .catch(() => alive && setFailed(true));
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [attachment.id]);

  if (failed) {
    return (
      <div className={`grid place-items-center gap-1 bg-sunken p-4 text-center text-sm text-muted ${className ?? ""}`}>
        <ImageOff className="h-5 w-5" aria-hidden /> {t("detail.photoFailed")}
      </div>
    );
  }
  if (!url) return <Skeleton className={className} />;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block">
      <img src={url} alt={t("detail.photoAlt", { name: attachment.original_filename })} className={`object-cover ${className ?? ""}`} />
    </a>
  );
}
