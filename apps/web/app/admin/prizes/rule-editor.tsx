"use client";

import { useActionState, useMemo, useState } from "react";

import { classify, type PrizeRule, validateRule } from "@/lib/prize-tiers";
import { button, input, label } from "@/lib/ui";

import { type FormState, saveRule } from "../actions";

export type EditableRule = PrizeRule & { id: number | null };

const TIER_NAMES: Record<number, string> = {
  1: "1 · Grand prize / overall",
  2: "2 · Main track or runner-up",
  3: "3 · Sponsor challenge",
  4: "4 · MLH / best use of X",
  5: "5 · Not a placement",
};

/** Edit one prize rule, with live validation against the whole rule set before saving. */
export function RuleEditor({ rule, allRules, defaultTier }: { rule: EditableRule; allRules: EditableRule[]; defaultTier: number }) {
  const [draft, setDraft] = useState<EditableRule>(rule);
  const [state, action, pending] = useActionState<FormState, FormData>(saveRule, { ok: false, errors: [] });

  const problems = useMemo(() => {
    const after = rule.id === null ? [...allRules, draft] : allRules.map((r) => (r.id === rule.id ? draft : r));
    return validateRule(draft, after, defaultTier);
  }, [draft, allRules, rule.id, defaultTier]);

  const set = <K extends keyof EditableRule>(key: K, value: EditableRule[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const id = rule.id ?? "new";

  return (
    <form action={action} className="grid gap-4">
      {rule.id !== null && <input type="hidden" name="id" value={rule.id} />}
      <div className="grid gap-4 min-[700px]:grid-cols-[2fr_1.4fr_1fr]">
        <div>
          <label className={label} htmlFor={`name-${id}`}>Rule name</label>
          <input id={`name-${id}`} name="name" value={draft.name} onChange={(e) => set("name", e.target.value)} className={`${input} mt-1`} />
        </div>
        <div>
          <label className={label} htmlFor={`tier-${id}`}>Tier</label>
          <select id={`tier-${id}`} name="tier" value={draft.tier} onChange={(e) => set("tier", Number(e.target.value))} className={`${input} mt-1`}>
            {[1, 2, 3, 4, 5].map((t) => (
              <option key={t} value={t}>{TIER_NAMES[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor={`match-${id}`}>Match against</label>
          <select id={`match-${id}`} name="match" value={draft.match} onChange={(e) => set("match", e.target.value as EditableRule["match"])} className={`${input} mt-1`}>
            <option value="stripped">Name without rewards</option>
            <option value="full">Full name</option>
          </select>
        </div>
      </div>
      <div>
        <label className={label} htmlFor={`pattern-${id}`}>Pattern (case-insensitive regular expression)</label>
        <input id={`pattern-${id}`} name="pattern" value={draft.pattern} onChange={(e) => set("pattern", e.target.value)} spellCheck={false} className={`${input} mt-1 font-[ui-monospace,monospace] text-[15px]`} />
      </div>
      <div>
        <label className={label} htmlFor={`examples-${id}`}>Real prize names this rule must catch, one per line</label>
        <textarea id={`examples-${id}`} name="examples" rows={3} value={draft.examples.join("\n")} onChange={(e) => set("examples", e.target.value.split("\n"))} className={`${input} mt-1`} />
      </div>
      <label className="flex items-center gap-2 text-[15px]">
        <input type="checkbox" name="enabled" checked={draft.enabled !== false} onChange={(e) => set("enabled", e.target.checked)} />
        Enabled
      </label>
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending || problems.length > 0} className={button}>
          {pending ? "Saving" : rule.id === null ? "Add rule" : "Save rule"}
        </button>
        {state.ok && !pending && <span role="status" className="text-[15px] text-muted">Saved. Applies at the next rating run.</span>}
      </div>
      {[...problems, ...state.errors].length > 0 && (
        <ul role="alert" className="list-disc pl-5 text-[15px]">
          {[...new Set([...problems, ...state.errors])].map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
    </form>
  );
}

/** Type any prize name and see which rule would tier it, using the saved rules. */
export function PrizeTester({ rules, defaultTier }: { rules: PrizeRule[]; defaultTier: number }) {
  const [name, setName] = useState("Best Use of MongoDB Atlas (Wireless Earbuds [1st])");
  const decision = classify(rules, defaultTier, name);
  return (
    <div className="rounded-card bg-chrome p-7">
      <label className={label} htmlFor="tester">Try a prize name</label>
      <input id="tester" value={name} onChange={(e) => setName(e.target.value)} className="mt-2 w-full rounded-tile bg-bg px-4 py-2.5 focus:outline-none focus-visible:shadow-[0_0_0_3px_var(--color-select)]" />
      <p className="mt-4" aria-live="polite">
        <span className="stat text-[40px]">Tier {decision.tier}</span>
        <span className="ml-3 text-muted">
          {decision.reason === "default" ? "no rule matched, so the default tier" : `decided by ${decision.reason.replace("rule: ", "")}`}
        </span>
      </p>
    </div>
  );
}
