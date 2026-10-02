import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Panel } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError } from "@/services/api";
import { LANGUAGES, type Language } from "@/types/auth";

export default function ProfilePage() {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.full_name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [lang, setLang] = useState<Language>(user?.preferred_language ?? "en");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  if (!user) return null;

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setFields({});
    try {
      setUser(await api.auth.updateMe({ full_name: name, phone: phone || null, preferred_language: lang }));
      toast.success("Profile saved");
    } catch (err) {
      if (err instanceof ApiError) { setFields(err.fields); toast.error(err.message); }
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-[32px] font-bold">My profile</h1>
      <Panel className="max-w-xl p-5 sm:p-6">
        <form onSubmit={save} className="space-y-5">
          <TextField label="Full name" value={name} onChange={(e) => setName(e.target.value)} error={fields.full_name} />
          <TextField label="Phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} error={fields.phone} />
          <SelectField label="Preferred language" value={lang} onChange={(e) => setLang(e.target.value as Language)}
            hint="Used for SafeAssist replies and translated reports.">
            {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.native} ({l.label})</option>)}
          </SelectField>
          <Button type="submit" loading={busy}>Save profile</Button>
        </form>
      </Panel>
    </div>
  );
}
