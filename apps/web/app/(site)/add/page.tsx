import type { Metadata } from "next";
import { Suspense } from "react";

import { SectionHead, Win } from "@/components/os/window";
import { asUsername } from "@/lib/add";

import { AddForm } from "./add-form";

export const metadata: Metadata = { title: "Add yourself", robots: { index: false } };

// Where "Not here? Add yourself" lands (spec 2026-10-29-find-yourself).
export default function AddPage(props: PageProps<"/add">) {
  return (
    <>
      <SectionHead as="h1" title="Add yourself">
        Enter your Devpost username. We&apos;ll find the hackathons you entered, load the ones that count, and rate you,
        usually the same day.
      </SectionHead>
      <div className="max-w-[640px]">
        <Win title="add.app">
          <Suspense fallback={<AddForm initial="" />}>
            <Prefilled searchParams={props.searchParams} />
          </Suspense>
        </Win>
      </div>
    </>
  );
}

async function Prefilled({ searchParams }: Pick<PageProps<"/add">, "searchParams">) {
  const u = (await searchParams).u;
  return <AddForm initial={asUsername(typeof u === "string" ? u : null) ?? ""} />;
}
