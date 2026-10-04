import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, FileQuestion } from "lucide-react";
import { Badge, EmptyState, Panel, Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { DetailsTab } from "@/components/profile/DetailsTab";
import { HealthTab } from "@/components/profile/HealthTab";
import { PasswordActions } from "@/components/profile/PasswordActions";
import { RecordsTab, WorkHistoryTab } from "@/components/profile/RecordsTab";
import { TeamTab } from "@/components/profile/TeamTab";
import { useT, type MessageKey } from "@/i18n";
import { roleKey } from "@/i18n/labels";
import { api } from "@/services/api";
import type { Profile } from "@/types/people";
import { cn } from "@/utils/cn";

type Tab = "details" | "health" | "records" | "history" | "team";

const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

function PersonView({ profile, onChange, withTeam }: { profile: Profile; onChange: (p: Profile) => void; withTeam: boolean }) {
  const { t } = useT();
  const [params, setParams] = useSearchParams();
  const tabs: [Tab, MessageKey][] = [["details", "prof.tabDetails"], ["health", "prof.tabHealth"], ["records", "prof.tabRecords"],
    ["history", "prof.tabHistory"], ...(withTeam ? [["team", profile.role === "admin" ? "prof.tabTeamAdmin" : "prof.tabTeam"] as [Tab, MessageKey]] : [])];
  const asked = params.get("tab") as Tab | null;
  const tab: Tab = tabs.some(([k]) => k === asked) ? asked! : "details";

  return (
    <div className="space-y-6">
      <Panel className="flex flex-col gap-4 p-5 sm:flex-row sm:flex-wrap sm:items-center">
        <div aria-hidden className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-ink font-display text-2xl font-bold text-bg">
          {initials(profile.full_name)}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-[28px] font-bold leading-tight">{profile.full_name}</h1>
          <p className="text-muted">{[profile.designation, profile.department?.name, profile.employee_id].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="info">{t(roleKey(profile.role))}</Badge>
          {!profile.is_active && <Badge tone="neutral">{t("users.inactive")}</Badge>}
          {profile.blood_group && <Badge tone="danger">{t("prof.bloodGroup")}: {profile.blood_group}</Badge>}
        </div>
        <div className="flex flex-wrap gap-2 sm:basis-full sm:justify-end"><PasswordActions profile={profile} /></div>
      </Panel>

      <div role="tablist" aria-label={t("prof.sections")} className="flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map(([k, label]) => (
          <button key={k} role="tab" type="button" aria-selected={tab === k} aria-controls={`panel-${k}`} id={`tab-${k}`}
            onClick={() => setParams(k === "details" ? {} : { tab: k }, { replace: true })}
            className={cn("min-h-[44px] shrink-0 border-b-2 px-4 text-[15px] font-semibold transition-colors",
              tab === k ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink")}>
            {t(label)}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "details" && <DetailsTab profile={profile} onSaved={onChange} />}
        {tab === "health" && <HealthTab profile={profile} />}
        {tab === "records" && <RecordsTab profile={profile} />}
        {tab === "history" && <WorkHistoryTab profile={profile} />}
        {tab === "team" && <TeamTab />}
      </div>
    </div>
  );
}

/** /app/profile: the signed-in person, plus the people they manage. */
export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  useEffect(() => { api.people.me().then(setProfile).catch(() => {}); }, []);
  if (!profile) return <div className="space-y-4"><Skeleton className="h-28" /><Skeleton className="h-64" /></div>;
  return <PersonView profile={profile} onChange={setProfile} withTeam={profile.role !== "worker"} />;
}

/** /app/people/:id: someone you manage (or yourself). */
export function PersonPage() {
  const { t } = useT();
  const { id } = useParams();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    setProfile(null);
    setMissing(false);
    api.people.get(Number(id)).then(setProfile).catch(() => setMissing(true));
  }, [id]);
  const back = (
    <Link to="/app/profile?tab=team" className="inline-flex min-h-[44px] items-center gap-1 text-[15px] font-semibold text-muted hover:text-ink">
      <ArrowLeft className="h-4 w-4" aria-hidden /> {t("team.back")}
    </Link>
  );
  if (missing) {
    return <div className="space-y-4">{back}<Panel><EmptyState icon={<FileQuestion className="h-6 w-6" />} title={t("team.notFound")}
      body={t("team.notFoundBody")} action={<Button asChild variant="outline"><Link to="/app/profile">{t("nav.profile")}</Link></Button>} /></Panel></div>;
  }
  if (!profile) return <div className="space-y-4">{back}<Skeleton className="h-28" /><Skeleton className="h-64" /></div>;
  return <div className="space-y-4">{back}<PersonView profile={profile} onChange={setProfile} withTeam={false} /></div>;
}
