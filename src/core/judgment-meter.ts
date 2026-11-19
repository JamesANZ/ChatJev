import type { JudgmentView, Leaning } from "./types";

export type JudgmentMeter =
  | { kind: "noul"; tone: Leaning; percent: number; caption: string }
  | { kind: "choice"; tone: Leaning; percent: number; caption: string }
  | { kind: "none" };

const LEANING_LABEL: Record<Leaning, string> = {
  yes: "Yes",
  no: "No",
  unsure: "Unsure",
};

export function judgmentMeter(judgments: JudgmentView[]): JudgmentMeter {
  const noul = judgments.find((item) => item.type === "noul" && item.noul != null);
  if (noul?.leaning && noul.noul != null) {
    return {
      kind: "noul",
      tone: noul.leaning,
      percent: Math.round(noul.noul * 100),
      caption: LEANING_LABEL[noul.leaning],
    };
  }
  const choice = judgments.find((item) => item.type === "choice");
  if (choice) {
    const amount = choice.confidence ?? 0;
    const open = choice.leaning !== "yes";
    return {
      kind: "choice",
      tone: open ? "unsure" : "yes",
      percent: Math.round(amount * 100),
      caption: open ? "Unsure" : (choice.label ?? "Yes"),
    };
  }
  return { kind: "none" };
}
