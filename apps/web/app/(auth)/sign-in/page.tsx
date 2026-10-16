import type { Metadata } from "next";
import { Suspense } from "react";

import { SectionHead, Win } from "@/components/os/window";
import { safeNext } from "@/lib/safe-next";

import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <>
      <SectionHead as="h1" title="Sign in">
        We&apos;ll email you a link. No password.
      </SectionHead>
      <div className="max-w-[640px]">
        <Win title="sign_in.app">
          <Suspense fallback={null}>
            <Form searchParams={searchParams} />
          </Suspense>
        </Win>
      </div>
    </>
  );
}

async function Form({ searchParams }: Pick<PageProps<"/sign-in">, "searchParams">) {
  const { next, error } = await searchParams;
  return (
    <div className="p-[22px]">
      {error === "link" && (
        <p role="alert" className="mb-4 max-w-[44ch]">
          That sign-in link expired or was already used. Send yourself a new one.
        </p>
      )}
      <SignInForm next={safeNext(typeof next === "string" ? next : undefined, "/")} />
    </div>
  );
}
