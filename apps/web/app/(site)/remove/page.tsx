import type { Metadata } from "next";

import { SectionHead, Win } from "@/components/os/window";

import { RemoveFlow } from "./remove-flow";

export const metadata: Metadata = {
  title: "Remove me",
  description: "Take your profile off HackLadder. No account needed, no questions asked.",
  alternates: { canonical: "/remove" },
};

export default function RemovePage() {
  return (
    <>
      <SectionHead as="h1" title="Remove me">
        Instant and unconditional. No account needed, and nobody asks why.
      </SectionHead>
      <div className="grid grid-cols-[1.2fr_1fr] items-start gap-6 max-[980px]:grid-cols-1">
        <RemoveFlow />
        <Win title="what_happens">
          <ul className="grid list-disc gap-3 py-[22px] pr-[22px] pl-10 marker:text-muted">
            <li>Your profile, rating and name disappear from every page and from search at once.</li>
            <li>Your results still count for the people you competed against. On their teams you show as &ldquo;Hidden hacker&rdquo;.</li>
            <li>We prove it&apos;s you with a code in your Devpost bio, so nobody can remove someone else.</li>
            <li>Changed your mind? Claim your profile and make it public again from your profile settings.</li>
          </ul>
        </Win>
      </div>
    </>
  );
}
