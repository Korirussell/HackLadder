// The corrections.kind values (supabase/migrations/20261014000300), as the form offers them.
export const CORRECTION_KINDS = [
  { value: "remove_project", label: "A project here isn't mine" },
  { value: "add_to_project", label: "I'm missing from a project" },
  { value: "fix_placement", label: "A placement or prize is wrong" },
  { value: "merge_accounts", label: "Two profiles are the same person" },
  { value: "split_account", label: "This profile mixes up two people" },
  { value: "set_school", label: "The school is wrong" },
] as const;

export type CorrectionKind = (typeof CORRECTION_KINDS)[number]["value"];
