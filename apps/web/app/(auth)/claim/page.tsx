import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Button } from "@/components/site/bits";
import { LoadingWin } from "@/components/site/loading";
import { SectionHead, Win } from "@/components/os/window";
import { parseUsername } from "@/lib/claim";
import { createClient } from "@/lib/supabase/server";

import { ClaimFlow } from "./claim-flow";

export const metadata: Metadata = {
  title: "Claim your profile",
  description: "Prove a HackLadder profile is yours with a code in your Devpost bio.",
  robots: { index: false },
};

export default function ClaimPage(props: PageProps<"/claim">) {
  return (
    <>
      <SectionHead as="h1" title="Claim your profile">
        You&apos;re probably already on here. Claiming lets you add links, your school and a profile theme.
      </SectionHead>
      <div className="grid grid-cols-[1.2fr_1fr] items-start gap-6 max-[980px]:grid-cols-1">
        <Suspense fallback={<LoadingWin title="claim.app" height={260} />}>
          <Claim searchParams={props.searchParams} />
        </Suspense>
        <Win title="how_it_works">
          <ol className="grid list-decimal gap-3 py-[22px] pr-[22px] pl-11 marker:text-muted">
            <li>Sign in with your email. No password.</li>
            <li>Enter your Devpost username and get a code like hl-7KQ2-X9. It works for 48 hours.</li>
            <li>Paste the code anywhere in your Devpost bio and save. You can delete it afterward.</li>
            <li>Press Verify. We read your public Devpost profile once and look for the code.</li>
            <li>Have a second Devpost account? Verify it the same way and its results join your profile.</li>
          </ol>
        </Win>
      </div>
    </>
  );
}

async function Claim({ searchParams }: Pick<PageProps<"/claim">, "searchParams">) {
  const sp = await searchParams;
  const u = typeof sp.u === "string" ? (parseUsername(sp.u) ?? "") : "";
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) {
    const next = `/claim${u ? `?u=${encodeURIComponent(u)}` : ""}`;
    return (
      <Win title="claim.app" status={["step 1 of 3", "sign in"]}>
        <div className="grid gap-4 p-[22px]">
          <p>First, sign in. We&apos;ll email you a link; it works once.</p>
          <div>
            <Button href={`/sign-in?next=${encodeURIComponent(next)}`}>Sign in to claim</Button>
          </div>
        </div>
      </Win>
    );
  }

  const [{ data: mine }, { data: open }] = await Promise.all([
    supabase.from("people").select("slug, display_name").maybeSingle(),
    supabase.rpc("my_claim_attempts"),
  ]);
  return (
    <div className="grid gap-6">
      {mine && (
        <Win title="your_profile">
          <div className="flex flex-wrap items-center justify-between gap-3 p-[22px]">
            <p>
              You own{" "}
              <Link href={`/h/${mine.slug}`} className="font-bold underline">
                {mine.display_name}
              </Link>
              . Claim another Devpost account below to merge its results in.
            </p>
            <Button href="/me" alt>
              Edit your profile
            </Button>
          </div>
        </Win>
      )}
      <ClaimFlow
        initialUsername={u}
        open={(open ?? []).map((a) => ({ attemptId: a.attempt_id, username: a.username, expiresAt: a.expires_at }))}
        merging={Boolean(mine)}
      />
    </div>
  );
}
