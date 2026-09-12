import { describe, expect, it } from "vitest";
import type { ContentCard } from "@/shared/contracts";
import {
  calendarCards,
  calendarDate,
  cardsForDay,
  columnOf,
  dropPatchForColumn,
  groupByStatus,
  monthDays,
  nextDays,
  scheduleSlotIso,
  weekDays,
} from "./contentBoardUtils";

function card(overrides: Partial<ContentCard> = {}): ContentCard {
  return {
    id: crypto.randomUUID(),
    projectId: null,
    channel: "x",
    title: "t",
    body: "",
    bodyDoc: null,
    media: [],
    status: "draft",
    scheduledFor: null,
    publishedAt: null,
    publishUrl: null,
    publishError: null,
    sourceThreadId: null,
    sourceRunId: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("columnOf + groupByStatus", () => {
  it("collapses legacy review/approved into drafts and drops archived", () => {
    expect(columnOf("review")).toBe("draft");
    expect(columnOf("approved")).toBe("draft");
    expect(columnOf("scheduled")).toBe("scheduled");

    const grouped = groupByStatus([
      card({ status: "draft" }),
      card({ status: "review" }),
      card({ status: "approved" }),
      card({ status: "scheduled", scheduledFor: "2026-09-12T12:00:00.000Z" }),
      card({ status: "published", publishedAt: "2026-09-10T09:00:00.000Z" }),
      card({ status: "archived" }),
    ]);
    expect(grouped.get("draft")).toHaveLength(3);
    expect(grouped.get("scheduled")).toHaveLength(1);
    expect(grouped.get("published")).toHaveLength(1);
  });
});

describe("calendarCards + calendarDate", () => {
  it("includes scheduled and published cards, keys by scheduled then published date", () => {
    const scheduled = card({ status: "scheduled", scheduledFor: "2026-09-12T12:00:00.000Z" });
    const published = card({ status: "published", publishedAt: "2026-09-10T09:00:00.000Z" });
    const both = card({
      status: "published",
      scheduledFor: "2026-09-12T12:00:00.000Z",
      publishedAt: "2026-09-12T13:00:00.000Z",
    });
    const draft = card({ status: "draft" });
    expect(calendarCards([scheduled, published, both, draft])).toHaveLength(3);
    expect(calendarDate(both)).toBe("2026-09-12T12:00:00.000Z");
    expect(calendarDate(published)).toBe("2026-09-10T09:00:00.000Z");
    expect(calendarDate(draft)).toBeNull();
  });

  it("cardsForDay places cards on their calendar date", () => {
    const target = new Date(2026, 8, 12);
    const hit = card({ scheduledFor: "2026-09-12T12:00:00.000Z" });
    const miss = card({ scheduledFor: "2026-09-13T12:00:00.000Z" });
    expect(cardsForDay([hit, miss], target)).toEqual([hit]);
  });
});

describe("grids", () => {
  it("weekDays returns a Monday-start 7-day span", () => {
    const days = weekDays(new Date(2026, 8, 11)); // Fri Sep 11
    expect(days).toHaveLength(7);
    expect(days[0]!.getDay()).toBe(1); // Monday
    expect(days[0]!.getDate()).toBe(7);
    expect(days[6]!.getDate()).toBe(13);
  });

  it("monthDays returns a 42-cell Monday-start grid covering the month", () => {
    const days = monthDays(new Date(2026, 8, 11)); // September 2026
    expect(days).toHaveLength(42);
    expect(days[0]!.getDay()).toBe(1);
    // Sep 1 2026 is a Tuesday → grid starts Mon Aug 31
    expect(days[0]!.getDate()).toBe(31);
    expect(days.some((d) => d.getMonth() === 8 && d.getDate() === 30)).toBe(true);
  });
});

describe("scheduleSlotIso", () => {
  it("converts wall-clock slot times in the target zone to UTC", () => {
    expect(scheduleSlotIso("2026-09-12", "Asia/Kolkata", 12)).toBe("2026-09-12T06:30:00.000Z");
    expect(scheduleSlotIso("2026-09-12", "America/New_York", 12)).toBe("2026-09-12T16:00:00.000Z");
    expect(scheduleSlotIso("2026-09-12", "Asia/Tokyo", 9)).toBe("2026-09-12T00:00:00.000Z");
    expect(scheduleSlotIso("2026-09-12", "Europe/London", 18)).toBe("2026-09-12T17:00:00.000Z");
    // Past-midnight rollover lands on the next UTC day
    expect(scheduleSlotIso("2026-09-12", "America/Los_Angeles", 21)).toBe(
      "2026-09-13T04:00:00.000Z",
    );
  });

  it("returns null for an invalid date string", () => {
    expect(scheduleSlotIso("not-a-date", "America/New_York", 9)).toBeNull();
  });
});

describe("nextDays", () => {
  it("returns consecutive YYYY-MM-DD dates starting from `from`", () => {
    const days = nextDays(3, new Date(2026, 8, 11));
    expect(days.map((d) => d.dateStr)).toEqual(["2026-09-11", "2026-09-12", "2026-09-13"]);
  });
});

describe("dropPatchForColumn", () => {
  const now = new Date("2026-09-13T12:00:00.000Z");

  it("moves cards between the draft and scheduled columns", () => {
    expect(dropPatchForColumn(card({ status: "draft" }), "scheduled", now)).toEqual({
      status: "scheduled",
      scheduledFor: "2026-09-13T12:10:00.000Z",
    });
    expect(
      dropPatchForColumn(
        card({ status: "scheduled", scheduledFor: "2026-09-12T12:00:00.000Z" }),
        "draft",
        now,
      ),
    ).toEqual({ status: "draft", scheduledFor: null });
  });

  it("treats legacy review/approved cards as drafts", () => {
    expect(dropPatchForColumn(card({ status: "review" }), "draft", now)).toBeNull();
    expect(dropPatchForColumn(card({ status: "approved" }), "scheduled", now)).toEqual({
      status: "scheduled",
      scheduledFor: "2026-09-13T12:10:00.000Z",
    });
  });

  it("clears the live post link when a published card leaves Published", () => {
    const live = card({
      status: "published",
      publishUrl: "https://x.com/post/1",
      publishedAt: "2026-09-10T09:00:00.000Z",
    });
    expect(dropPatchForColumn(live, "draft", now)).toEqual({
      status: "draft",
      scheduledFor: null,
      publishUrl: null,
      publishError: null,
    });
    expect(dropPatchForColumn(live, "scheduled", now)).toEqual({
      status: "scheduled",
      scheduledFor: "2026-09-13T12:10:00.000Z",
      publishUrl: null,
      publishError: null,
    });
  });

  it("rejects drops on the Published column and same-column drops", () => {
    expect(dropPatchForColumn(card({ status: "draft" }), "published")).toBeNull();
    expect(dropPatchForColumn(card({ status: "scheduled" }), "published")).toBeNull();
    expect(dropPatchForColumn(card({ status: "draft" }), "draft")).toBeNull();
    expect(dropPatchForColumn(card({ status: "archived" }), "archived")).toBeNull();
  });
});
