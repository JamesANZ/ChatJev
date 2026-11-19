export type ChatActivity =
  | { status: "idle" }
  | { status: "uploading"; chatId: string | null }
  | { status: "asking"; chatId: string };

export type DragPhase = { status: "idle" } | { status: "hovering" };

export type Drawer = "closed" | "open";

export type SidebarMode =
  | { kind: "absent" }
  | { kind: "docked" }
  | { kind: "drawer"; open: boolean };

export function beginUpload(
  activity: ChatActivity,
  chatId: string | null,
): Extract<ChatActivity, { status: "uploading" }> | null {
  if (activity.status !== "idle") return null;
  return { status: "uploading", chatId };
}

export function beginAsk(
  activity: ChatActivity,
  chatId: string,
): Extract<ChatActivity, { status: "asking" }> | null {
  if (activity.status !== "idle") return null;
  return { status: "asking", chatId };
}

export function finishActivity(
  activity: ChatActivity,
  started: ChatActivity,
): ChatActivity {
  if (started.status === "idle" || activity.status === "idle") return activity;
  if (activity.status !== started.status) return activity;
  if (activity.chatId !== started.chatId) return activity;
  return { status: "idle" };
}

export function keepDraftAttachments(activity: ChatActivity): boolean {
  return activity.status === "uploading" && activity.chatId === null;
}

export function composerBusy(activity: ChatActivity): boolean {
  return activity.status !== "idle";
}

export function showPending(
  activity: ChatActivity,
  activeChatId: string | null,
): boolean {
  return activity.status === "asking" && activity.chatId === activeChatId;
}

export function dragEnter(phase: DragPhase): DragPhase {
  if (phase.status === "hovering") return phase;
  return { status: "hovering" };
}

export function dragLeave(phase: DragPhase, pointerStillInside: boolean): DragPhase {
  if (phase.status === "idle" || pointerStillInside) return phase;
  return { status: "idle" };
}

export function dragReset(): DragPhase {
  return { status: "idle" };
}

export function sidebarMode(input: {
  hasHistory: boolean;
  desktop: boolean;
  drawer: Drawer;
}): SidebarMode {
  if (!input.hasHistory) return { kind: "absent" };
  if (input.desktop) return { kind: "docked" };
  return { kind: "drawer", open: input.drawer === "open" };
}
