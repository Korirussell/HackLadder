import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { signOut } from "@/app/(auth)/actions";
import { altButtonClass, Button, Empty } from "@/components/site/bits";
import { LoadingWin } from "@/components/site/loading";
import { SectionHead, Win } from "@/components/os/window";
import { getSchoolOptions } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { isTheme } from "@/lib/theme";

import { DetailsForm, HideForm, SchoolForm, ThemePicker } from "./forms";

export const metadata: Metadata = { title: "Your profile", robots: { index: false } };

export default function MePage() {
  return (
    <>
      <SectionHead as="h1" title="Your profile">
        Everything here is yours to change. Results come from Devpost; to fix one, send a correction.
      </SectionHead>
      <Suspense fallback={<LoadingWin title="~/me" height={400} />}>
        <Dashboard />
      </Suspense>
    </>
  );
}

const KIND: Record<string, string> = {
  remove_project: "remove a project",
  add_to_project: "add me to a project",
  merge_accounts: "merge accounts",
  split_account: "split an account",
  fix_placement: "fix a placement",
  set_school: "add a school",
};

async function Dashboard() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) {
    return (
      <Win title="~/me">
        <Empty action={<Button href="/sign-in?next=/me">Sign in</Button>}>Sign in to manage your profile.</Empty>
      </Win>
    );
  }
  const email = auth.claims.email as string | undefined;
  const [{ data: me }, { data: corrections }, { data: candidates }, schools] = await Promise.all([
    supabase
      .from("people")
      .select("id, slug, display_name, bio, github_url, linkedin_url, website_url, school_id, hidden, profile_theme")
      .maybeSingle(),
    supabase.from("corrections").select("id, kind, status, created_at, note").order("created_at", { ascending: false }).limit(20),
    supabase.rpc("my_merge_candidates"),
    getSchoolOptions(),
  ]);

  const account = (
    <Win title="account" status={[email ?? "signed in", ""]}>
      <div className="flex flex-wrap items-center gap-2.5 p-[22px]">
        <form action={signOut}>
          <button type="submit" className={altButtonClass}>
            Sign out
          </button>
        </form>
        <Link href="/remove" className="text-[15px] text-muted underline hover:text-ink">
          Remove me from HackLadder
        </Link>
      </div>
    </Win>
  );

  const correctionsWin = (
    <Win title="corrections" meta="reviewed within a week">
      {corrections?.length ? (
        corrections.map((c) => (
          <div key={c.id} className="flex items-baseline justify-between gap-3 border-b border-line px-3.5 py-2.5 last:border-b-0">
            <span>
              {KIND[c.kind] ?? c.kind}
              {c.note && <span className="block text-[13px] text-muted">{c.note}</span>}
            </span>
            <span className="sys text-muted">
              {c.status} · {c.created_at.slice(0, 10)}
            </span>
          </div>
        ))
      ) : (
        <Empty>No corrections sent. Spot something wrong on a profile? Use its &ldquo;Something wrong?&rdquo; button.</Empty>
      )}
    </Win>
  );

  if (!me) {
    return (
      <div className="grid max-w-[880px] gap-6">
        <Win title="~/me">
          <Empty action={<Button href="/claim">Claim your profile</Button>}>
            You haven&apos;t claimed a profile yet. Claim yours with a code in your Devpost bio, then come back to add links, your
            school and a theme.
          </Empty>
        </Win>
        {correctionsWin}
        {account}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[1.2fr_1fr] items-start gap-6 max-[980px]:grid-cols-1">
      <div className="grid gap-6">
        <Win title="~/me" meta={me.hidden ? "hidden" : "public"}>
          <div className="flex flex-wrap items-center justify-between gap-3 p-[22px]">
            <p className="text-sub">
              <b>{me.display_name}</b>
            </p>
            <Button href={`/h/${me.slug}`} alt>
              View profile
            </Button>
          </div>
        </Win>
        <Win title="details" meta="shown on your profile">
          <DetailsForm
            initial={{ bio: me.bio ?? "", github: me.github_url ?? "", linkedin: me.linkedin_url ?? "", website: me.website_url ?? "" }}
          />
        </Win>
        <Win title="school">
          <SchoolForm schools={schools} current={me.school_id} />
        </Win>
        <Win title="profile_theme" meta="claim perk">
          <ThemePicker name={me.display_name} current={isTheme(me.profile_theme) ? me.profile_theme : null} />
        </Win>
      </div>
      <div className="grid gap-6">
        <Win title="are_these_also_you">
          {candidates?.length ? (
            candidates.map((c) => (
              <div key={c.username} className="flex items-center justify-between gap-3 border-b border-line px-3.5 py-2.5 last:border-b-0">
                <span>
                  {c.display_name} <span className="sys text-[11px] text-muted">devpost/{c.username}</span>
                </span>
                <Link href={`/claim?u=${encodeURIComponent(c.username)}`} className="sys rounded-md border border-line px-2.5 py-1 hover:border-ink">
                  verify &amp; merge
                </Link>
              </div>
            ))
          ) : (
            <Empty>
              No likely duplicate accounts. Have another Devpost account?{" "}
              <Link href="/claim" className="underline">
                Claim it too
              </Link>{" "}
              and its results join this profile.
            </Empty>
          )}
        </Win>
        {correctionsWin}
        <Win title="visibility">
          <HideForm hidden={me.hidden} />
        </Win>
        <Win title="emails">
          <Empty>Weekly &ldquo;your rating moved&rdquo; emails are coming. You&apos;ll be able to opt in here.</Empty>
        </Win>
        {account}
      </div>
    </div>
  );
}
