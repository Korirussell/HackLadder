import type { Metadata } from "next";
import { Suspense } from "react";

import { safeNext } from "@/lib/safe-next";

import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in · HackLadder", robots: { index: false } };

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <main className="mx-auto flex min-h-svh max-w-content flex-col justify-center px-4 py-16 min-[900px]:pl-[calc(var(--spacing-rail)+40px)]">
      <h1 className="display text-section">Sign in</h1>
      <p className="mt-6 max-w-[34ch] text-graphite">We&apos;ll email you a link. No password.</p>
      <Suspense fallback={null}>
        <Form searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Form({ searchParams }: Pick<PageProps<"/sign-in">, "searchParams">) {
  const { next, error } = await searchParams;
  return (
    <>
      {error === "link" && (
        <p role="alert" className="mt-6 max-w-[44ch]">
          That sign-in link expired or was already used. Send yourself a new one.
        </p>
      )}
      <SignInForm next={safeNext(typeof next === "string" ? next : undefined, "/")} />
    </>
  );
}
