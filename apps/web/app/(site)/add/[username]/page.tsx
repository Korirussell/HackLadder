import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { LoadingWin } from "@/components/site/loading";
import { SectionHead } from "@/components/os/window";
import { asUsername } from "@/lib/add";
import { getAddRequest } from "@/lib/add-data";

import { AddStatusView } from "./status-view";

export const metadata: Metadata = { title: "Add yourself", robots: { index: false } };

export default function AddStatusPage(props: PageProps<"/add/[username]">) {
  return (
    <>
      <SectionHead as="h1" title="Add yourself" />
      <Suspense fallback={<LoadingWin title="status" height={200} />}>
        <Status params={props.params} />
      </Suspense>
    </>
  );
}

async function Status({ params }: Pick<PageProps<"/add/[username]">, "params">) {
  const username = asUsername(decodeURIComponent((await params).username));
  if (!username) notFound();
  const r = await getAddRequest(username);
  if (!r) redirect(`/add?u=${encodeURIComponent(username)}`);
  return <AddStatusView initial={r} />;
}
