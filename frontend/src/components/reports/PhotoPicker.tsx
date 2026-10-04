import { useEffect, useMemo, useRef } from "react";
import { Camera, ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";

export const MAX_PHOTOS = 3;
const MAX_MB = 10;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Shrink big phone photos before upload so reports go through on slow site data. The server re-checks
 * and re-encodes everything anyway; if the browser can't resize, the original is sent. */
export async function shrink(file: File, maxSide = 2048): Promise<File> {
  if (file.size < 1.5 * 1024 * 1024 || typeof createImageBitmap !== "function") return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

/** Which rule a file breaks, if any: caught here so the worker finds out before uploading. */
export function checkPhoto(file: File): "badType" | "tooBig" | null {
  if (!TYPES.includes(file.type)) return "badType";
  if (file.size > MAX_MB * 1024 * 1024) return "tooBig";
  return null;
}

export function PhotoPicker({ photos, onChange, error, onError }: {
  photos: File[]; onChange: (files: File[]) => void; error?: string; onError: (msg: string) => void;
}) {
  const { t } = useT();
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const previews = useMemo(() => photos.map((p) => URL.createObjectURL(p)), [photos]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  async function add(list: FileList | null) {
    if (!list?.length) return;
    const incoming = Array.from(list);
    const bad = incoming.find((f) => checkPhoto(f));
    if (bad) {
      onError(checkPhoto(bad) === "badType" ? t("photos.badType", { name: bad.name }) : t("photos.tooBig", { name: bad.name, max: MAX_MB }));
      return;
    }
    if (photos.length + incoming.length > MAX_PHOTOS) { onError(t("photos.tooMany", { max: MAX_PHOTOS })); return; }
    onChange([...photos, ...(await Promise.all(incoming.map((f) => shrink(f))))]);
  }

  const full = photos.length >= MAX_PHOTOS;
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">{t("photos.label")} <span className="font-normal text-muted">{t("photos.optional", { max: MAX_PHOTOS })}</span></p>
      {photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-2">
          {photos.map((p, i) => (
            <li key={previews[i]} className="relative aspect-square overflow-hidden rounded-md border border-line bg-sunken">
              <img src={previews[i]} alt={`${t("photos.alt", { n: i + 1 })}: ${p.name}`} className="h-full w-full object-cover" />
              <button type="button" onClick={() => onChange(photos.filter((_, j) => j !== i))}
                className="absolute right-1 top-1 grid h-9 w-9 place-items-center rounded-full bg-black/70 text-white hover:bg-black"
                aria-label={t("photos.remove", { n: i + 1 })}>
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={full} onClick={() => camera.current?.click()}>
          <Camera className="h-4 w-4" aria-hidden /> {t("photos.take")}
        </Button>
        <Button type="button" variant="outline" disabled={full} onClick={() => gallery.current?.click()}>
          <ImagePlus className="h-4 w-4" aria-hidden /> {t("photos.gallery")}
        </Button>
      </div>
      {/* Two inputs: `capture` opens the camera straight away on phones, the other allows the gallery. */}
      <input ref={camera} type="file" accept={TYPES.join(",")} capture="environment" className="hidden" tabIndex={-1}
        aria-hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      <input ref={gallery} type="file" accept={TYPES.join(",")} multiple className="hidden" tabIndex={-1}
        data-testid="photo-input" aria-hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      {error ? <p role="alert" className="text-sm font-medium text-danger">{error}</p>
        : <p className="text-sm text-muted">{t("photos.note")}</p>}
    </div>
  );
}
