import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Button, Empty } from "@/components/site/bits";
import { LoadingWin } from "@/components/site/loading";
import { SectionHead, Win } from "@/components/os/window";
import { getHacker } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

import { CorrectionForm } from "./correction-form";

export const metadata: Metadata = { title: "Something wrong?", robots: { index: false } };

export default function NewCorrection(props: PageProps<"/corrections/new">) {
  return (
    <>
      <SectionHead as="h1" title="Something wrong?">
        Corrections change the inputs, never a rating by hand. An admin reviews each one within a week.
      </SectionHead>
      <Suspense fallback={<LoadingWin title="correction.app" />}>
        <Body searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Body({ searchParams }: Pick<PageProps<"/corrections/new">, "searchParams">) {
  const sp = await searchParams;
  const slug = typeof sp.person === "string" ? sp.person : "";
  const person = slug ? await getHacker(slug) : null;
  if (!person) {
    return (
      <Win title="correction.app">
        <Empty action={<Button href="/hackers">Find the profile</Button>}>
          Open the profile that&apos;s wrong and press &ldquo;Something wrong?&rdquo;.
        </Empty>
      </Win>
    );
  }
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  return (
    <div className="max-w-[720px]">
      <Win title="correction.app" meta={`about ${person.display_name}`}>
        {auth?.claims ? (
          <CorrectionForm person={person.slug} events={person.events.map((e) => e.title)} />
        ) : (
          <Empty action={<Button href={`/sign-in?next=${encodeURIComponent(`/corrections/new?person=${person.slug}`)}`}>Sign in to send it</Button>}>
            Sign in first, so we can tell you when it&apos;s fixed. Want your profile gone instead?{" "}
            <Link href="/remove" className="underline">
              Remove it
            </Link>{" "}
            with no account.
          </Empty>
        )}
      </Win>
    </div>
  );
}
