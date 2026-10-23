import { describe, expect, it } from "vitest";
import { groupMeetings, type Meeting } from "@/lib/board";

const suspended: Meeting = {
  id: "live", meeting_year: 2026, meeting_number: 1, scheduled_at: "2026-10-23T10:00:00Z",
  mode: "presenza", location: "Piacenza", video_link: null, description: null, urgency_reason: null,
  status: "SOSPESO", status_reason: "Verifica comunicazione", minute_taker_id: null,
  started_at: "2026-10-23T10:01:00Z", ended_at: null, board_meeting_participants: [], board_agenda_items: [],
};
describe("Suspended live session classification", () => {
  it("keeps a started suspended session in live, never in concluded or upcoming", () => {
    const g = groupMeetings([suspended], new Date("2026-10-24T10:00:00Z"));
    expect(g.live.map((m) => m.id)).toEqual(["live"]);
    expect(g.concluded).toEqual([]);
    expect(g.upcoming).toEqual([]);
  });
});