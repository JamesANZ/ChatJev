import { describe, expect, it } from "vitest";
import {
  beginAsk,
  beginUpload,
  composerBusy,
  dragEnter,
  dragLeave,
  dragReset,
  finishActivity,
  keepDraftAttachments,
  showPending,
  sidebarMode,
  type ChatActivity,
} from "../src/lib/chat-session";

const idle: ChatActivity = { status: "idle" };

describe("chat activity", () => {
  it("starts an upload or a question only from idle", () => {
    const uploading = beginUpload(idle, null);
    const asking = beginAsk(idle, "chat-1");
    expect(uploading).toEqual({ status: "uploading", chatId: null });
    expect(asking).toEqual({ status: "asking", chatId: "chat-1" });
    expect(beginAsk(uploading!, "chat-1")).toBeNull();
    expect(beginUpload(asking!, "chat-1")).toBeNull();
    expect(beginAsk(asking!, "chat-2")).toBeNull();
  });

  it("finishes only the activity that started", () => {
    const uploading = beginUpload(idle, "chat-1")!;
    const asking = beginAsk(idle, "chat-2")!;
    expect(finishActivity(uploading, uploading)).toEqual({ status: "idle" });
    expect(finishActivity(asking, uploading)).toEqual(asking);
    expect(finishActivity(idle, uploading)).toEqual(idle);
  });

  it("keeps draft files while those files are still uploading", () => {
    const drafts = beginUpload(idle, null)!;
    const named = beginUpload(idle, "chat-1")!;
    expect(keepDraftAttachments(drafts)).toBe(true);
    expect(keepDraftAttachments(named)).toBe(false);
    expect(keepDraftAttachments(beginAsk(idle, "chat-1")!)).toBe(false);
  });

  it("shows the pending mark on the chat that is being judged", () => {
    const asking = beginAsk(idle, "chat-1")!;
    expect(showPending(asking, "chat-1")).toBe(true);
    expect(showPending(asking, "chat-2")).toBe(false);
    expect(showPending(asking, null)).toBe(false);
    expect(showPending(beginUpload(idle, "chat-1")!, "chat-1")).toBe(false);
    expect(composerBusy(idle)).toBe(false);
    expect(composerBusy(asking)).toBe(true);
  });
});

describe("drag phase", () => {
  it("stays hovering while the pointer moves across children", () => {
    const hovering = dragEnter({ status: "idle" });
    expect(hovering).toEqual({ status: "hovering" });
    expect(dragLeave(hovering, true)).toEqual(hovering);
    expect(dragLeave(hovering, false)).toEqual({ status: "idle" });
  });

  it("clears a cancelled drag", () => {
    expect(dragReset()).toEqual({ status: "idle" });
    expect(dragLeave({ status: "idle" }, false)).toEqual({ status: "idle" });
  });
});

describe("sidebar mode", () => {
  it("hides the history until a chat exists", () => {
    expect(
      sidebarMode({ hasHistory: false, desktop: false, drawer: "open" }),
    ).toEqual({ kind: "absent" });
  });

  it("docks on a wide screen and uses a drawer on a narrow one", () => {
    expect(
      sidebarMode({ hasHistory: true, desktop: true, drawer: "open" }),
    ).toEqual({ kind: "docked" });
    expect(
      sidebarMode({ hasHistory: true, desktop: false, drawer: "closed" }),
    ).toEqual({ kind: "drawer", open: false });
    expect(
      sidebarMode({ hasHistory: true, desktop: false, drawer: "open" }),
    ).toEqual({ kind: "drawer", open: true });
  });
});
