import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MinutesPanel from "@/components/board/MinutesPanel";
import { loadMinutes, saveMinutes, submitMinutesVote, type Meeting, type Minutes } from "@/lib/board";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/components/board/DocumentWorkflow", () => ({ default: () => <p>Routine documenti</p> }));

vi.mock("@/lib/board", async (original) => ({
  ...await original<typeof import("@/lib/board")>(),
  boardClient: { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }) },
  loadMinutes: vi.fn(), saveMinutes: vi.fn(), submitMinutesVote: vi.fn(),
}));
const meeting: Meeting = {
  id: "meeting", meeting_year: 2026, meeting_number: 1, scheduled_at: "2026-11-12T17:00:00Z",
  location: "Piacenza", mode: "presenza", video_link: null, description: null, urgency_reason: null,
  status: "IN_CORSO", status_reason: null, minute_taker_id: "secretary", started_at: "2026-11-12T17:00:00Z",
  ended_at: null, board_meeting_participants: [], board_agenda_items: [],
};
const minutes: Minutes = {
  id: "minutes", meeting_id: "meeting", number: 1, status: "BOZZA", current_version: 1, signed_path: null, signed_at: null,
  board_minute_rectifications: [],
  board_minute_versions: [{ id: "version", version: 1, body: "Testo salvato", content_hash: "12345678", source: "manuale", created_by: "president", created_at: "2026-11-12T17:00:00Z" }],
};
const clients: QueryClient[] = [];
function show(live = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><MinutesPanel m={{ ...meeting, ended_at: live ? null : "2026-11-12T18:00:00Z" }} me="president" president manager boardMember live={live} quorumMet eligible /></QueryClientProvider>);
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadMinutes).mockResolvedValue(minutes);
  vi.mocked(saveMinutes).mockImplementation(async (_id, body) => {
    vi.mocked(loadMinutes).mockResolvedValue({ ...minutes, board_minute_versions: [{ ...minutes.board_minute_versions[0], body }] });
  });
  vi.mocked(submitMinutesVote).mockResolvedValue("ballot");
});
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); });

describe("Minutes approval before closing", () => {
  it("requires saving the edited text before submitting it to a vote", async () => {
    show();
    const vote = await screen.findByRole("button", { name: "Sottoponi il verbale ad approvazione" });
    fireEvent.change(screen.getByRole("textbox", { name: "Testo del verbale" }), { target: { value: "Testo aggiornato" } });
    expect(vote).toBeDisabled();
    expect(screen.getByText("Salva il testo prima di sottoporlo al voto.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salva nuova versione" }));
    await waitFor(() => expect(vote).toBeEnabled());
    expect(saveMinutes).toHaveBeenCalledWith("meeting", "Testo aggiornato", "manuale", undefined);
    fireEvent.click(vote);
    await waitFor(() => expect(submitMinutesVote).toHaveBeenCalledWith("minutes"));
  });
  it("offers no ordinary approval after closure and keeps an approved text locked", async () => {
    vi.mocked(loadMinutes).mockResolvedValue({ ...minutes, status: "APPROVATO" });
    show(false);
    await screen.findByText(/Verbale approvato: versione definitiva bloccata/);
    expect(screen.queryByRole("textbox", { name: "Testo del verbale" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sottoponi il verbale/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Le rettifiche di un verbale già approvato o firmato/)).toBeInTheDocument();
  });
  it("allows editing an unsigned draft after closure without inventing a late vote", async () => {
    show(false);
    expect(await screen.findByRole("textbox", { name: "Testo del verbale" })).toBeEnabled();
    expect(screen.getByText(/Revisione dopo la chiusura/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sottoponi il verbale/ })).not.toBeInTheDocument();
  });
});
