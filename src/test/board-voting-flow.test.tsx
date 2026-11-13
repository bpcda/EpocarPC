import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DeliberationsPanel from "@/components/board/DeliberationsPanel";
import MinutesPanel from "@/components/board/MinutesPanel";
import { loadDeliberations, type Meeting } from "@/lib/board";

const mock = vi.hoisted(() => ({ rows: {} as Record<string, unknown>, rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    const query = {
      select: () => query, eq: () => query, is: () => query, order: () => query, limit: () => query,
      maybeSingle: async () => ({ data: mock.rows[table] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: mock.rows[table] ?? [], error: null }).then(resolve),
    };
    return query;
  }, rpc: mock.rpc,
} }));

const stamp = "2026-11-12T17:00:00Z";
const meeting: Meeting = {
  id: "meeting", meeting_year: 2026, meeting_number: 1, scheduled_at: stamp, location: "Piacenza", mode: "presenza",
  video_link: null, description: null, urgency_reason: null, status: "IN_CORSO", status_reason: null,
  minute_taker_id: "me", started_at: stamp, ended_at: null, board_agenda_items: [],
  board_meeting_participants: ["me", "other"].map((user_id) => ({ id: `p-${user_id}`, user_id, display_name: "Carlo Rossi",
    kind: "member", board_roles: ["councillor"], can_vote: true, response: "confirmed", present: true, identified_at: stamp })),
};
const ballot = {
  id: "ballot", status: "aperta", result: null, opened_at: stamp, tally: {}, quorum: {},
  board_votes: [{ id: "vote-other", user_id: "other", participant_id: "p-other", display_name: "Carlo Rossi", vote: "favorevole", recorded_at: stamp },
    { id: "vote-me", user_id: "me", participant_id: "p-me", display_name: "Carlo Rossi", vote: "astenuto", recorded_at: stamp }],
};
const deliberation = {
  id: "deliberation", meeting_id: "meeting", agenda_item_id: null, number: 1, title: "Attività", status: "IN_VOTAZIONE", current_version: 1, closed_reason: null,
  board_deliberation_versions: [{ id: "dv", version: 1, title: "Attività", body: "Proposta", content_hash: "12345678", created_by: "me", created_at: stamp }],
  board_ballots: [ballot], board_deliberation_conflicts: [],
};
const clients: QueryClient[] = [];
function show(kind: "deliberation" | "minutes", eligible = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  render(<QueryClientProvider client={client}>{kind === "deliberation"
    ? <DeliberationsPanel m={meeting} me="me" president boardMember manager active live quorumMet />
    : <MinutesPanel m={meeting} me="me" president manager boardMember live quorumMet eligible={eligible} />}</QueryClientProvider>);
}
beforeEach(() => {
  mock.rpc.mockReset().mockResolvedValue({ error: null });
  mock.rows = {
    board_deliberations: [deliberation], board_ballots: [ballot],
    board_minutes: { id: "minutes", meeting_id: "meeting", number: 1, status: "IN_APPROVAZIONE", current_version: 1, signed_path: null, signed_at: null,
      board_minute_versions: [{ id: "mv", version: 1, body: "Verbale", content_hash: "12345678", source: "manuale", created_by: "me", created_at: stamp }], board_minute_rectifications: [] },
  };
});
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); });

describe("Recorded voting identities and controls", () => {
  it("retains voting identities when parsing server rows and selects the right vote for homonyms", async () => {
    const data = await loadDeliberations("meeting");
    expect(data[0].board_ballots[0].board_votes.map((v) => v.user_id)).toEqual(["other", "me"]);
    show("deliberation");
    expect(await screen.findByRole("button", { name: "Astenuto" })).toHaveClass("bg-primary");
    expect(screen.getByRole("button", { name: "Favorevole" })).not.toHaveClass("bg-primary");
    fireEvent.click(screen.getByRole("button", { name: "Chiudi votazione" }));
    const close = screen.getByRole("button", { name: "Chiudi e verbalizza l'esito" });
    expect(close).toBeEnabled();
    expect(screen.queryByRole("textbox", { name: "Motivazione" })).not.toBeInTheDocument();
    fireEvent.click(close);
    await waitFor(() => expect(mock.rpc).toHaveBeenCalledWith("board_ballot_close", { _ballot: "ballot" }));
  });
  it("identifies the personal minutes vote by user ID", async () => {
    show("minutes");
    expect(await screen.findByText("Astenuto", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cambia in Favorevole" })).toBeInTheDocument();
  });
  it("does not mistake a homonym's minutes vote for the user's own vote", async () => {
    mock.rows.board_ballots = [{ ...ballot, board_votes: ballot.board_votes.slice(0,1) }];
    show("minutes");
    expect(await screen.findByRole("button", { name: "Favorevole" })).toBeInTheDocument();
    expect(screen.queryByText(/Hai votato/)).not.toBeInTheDocument();
  });
  it("hides minutes voting when the server excludes a temporary absence", async () => {
    show("minutes", false);
    await screen.findByText(/Votazione in corso sull'approvazione/);
    expect(screen.queryByRole("button", { name: /Cambia in/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Favorevole" })).not.toBeInTheDocument();
  });
  it("hides voting and discussion for the conflicted point and offers a recorded return", async () => {
    mock.rows.board_deliberations = [{ ...deliberation, board_deliberation_conflicts: [{ participant_id: "p-me", reason: "Interesse personale", returned_at: null }] }];
    show("deliberation");
    await screen.findByText(/Conflitto dichiarato/);
    expect(screen.queryByRole("button", { name: "Favorevole" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Suggerisci modifica" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registra rientro dopo il punto" })).toBeInTheDocument();
  });
});
