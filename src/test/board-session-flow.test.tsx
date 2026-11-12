import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LiveSession from "@/components/board/LiveSession";
import { loadBoardSession, sessionAction, type Meeting } from "@/lib/board";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

vi.mock("@/components/board/DeliberationsPanel", () => ({ default: () => null }));
vi.mock("@/components/board/AudioPanel", () => ({ default: () => null }));
vi.mock("@/components/board/MinutesPanel", () => ({ default: () => null }));
vi.mock("@/components/board/DossierPanel", () => ({ default: () => null }));
vi.mock("@/lib/board", async (original) => {
  const channel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() };
  return {
    ...await original<typeof import("@/lib/board")>(),
    boardClient: { channel: () => channel, removeChannel: vi.fn(), rpc: vi.fn().mockResolvedValue({ error: null }) },
    loadBoardSession: vi.fn(), sessionAction: vi.fn(),
  };
});

const meeting: Meeting = {
  id: "meeting", meeting_year: 2026, meeting_number: 1, scheduled_at: "2026-11-12T17:00:00Z",
  location: "Piacenza", mode: "presenza", video_link: null, description: null, urgency_reason: null,
  status: "IN_CORSO", status_reason: null, minute_taker_id: "secretary", started_at: "2026-11-12T17:00:00Z",
  ended_at: null, board_meeting_participants: [], board_agenda_items: [],
};
const session = { quorum: { total: 7, present: 4, required: 4, met: true }, events: [], minutesApproved: false, hasOpenBallot: false, openBallotId: null, chairUserId: "president", voterEligible: true };
const clients: QueryClient[] = [];
function show(president = true, boardMember = president, me = "president") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><LiveSession m={meeting} me={me} president={president} boardMember={boardMember} /></QueryClientProvider>);
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadBoardSession).mockResolvedValue(session);
  vi.mocked(sessionAction).mockResolvedValue();
});
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); });

describe("Closing a Board meeting", () => {
  it("grants meeting commands to the server-confirmed substitute, never to an unactivated vice president", async () => {
    vi.mocked(loadBoardSession).mockResolvedValue({ ...session, chairUserId: "vice" });
    show(false,true,"vice");
    expect(await screen.findByRole("button", { name: "Chiudi seduta" })).toBeInTheDocument();
    cleanup();
    vi.mocked(loadBoardSession).mockResolvedValue(session);
    show(false,true,"vice");
    await screen.findByText("Quorum raggiunto");
    expect(screen.queryByRole("button", { name: "Chiudi seduta" })).not.toBeInTheDocument();
  });
  it("requires only a reason to close without approved minutes, including without quorum", async () => {
    vi.mocked(loadBoardSession).mockResolvedValue({ ...session, quorum: { total: 5, present: 1, required: 3, met: false } });
    show();
    await screen.findByText("Quorum non raggiunto · non è possibile deliberare");
    fireEvent.click(screen.getByRole("button", { name: "Chiudi seduta" }));
    const confirm = screen.getByRole("button", { name: "Conferma chiusura" });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Motivazione della seduta" }), { target: { value: "Quorum non raggiunto" } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(sessionAction).toHaveBeenCalledWith("meeting", "close", "Quorum non raggiunto"));
  });
  it("does not demand a reason or show an unapproved warning after approval", async () => {
    vi.mocked(loadBoardSession).mockResolvedValue({ ...session, minutesApproved: true });
    show();
    await screen.findByText("Quorum raggiunto");
    fireEvent.click(screen.getByRole("button", { name: "Chiudi seduta" }));
    expect(screen.getByText(/Il verbale è approvato/)).toBeInTheDocument();
    expect(screen.queryByText(/Il verbale non è approvato/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Conferma chiusura" }));
    await waitFor(() => expect(sessionAction).toHaveBeenCalledWith("meeting", "close", ""));
  });
  it("keeps closure disabled while either kind of ballot is open", async () => {
    vi.mocked(loadBoardSession).mockResolvedValue({ ...session, minutesApproved: true, hasOpenBallot: true });
    show();
    await screen.findByText("Quorum raggiunto");
    fireEvent.click(screen.getByRole("button", { name: "Chiudi seduta" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Concludi o annulla la votazione");
    fireEvent.change(screen.getByRole("textbox", { name: "Motivazione della seduta" }), { target: { value: "Fine seduta" } });
    expect(screen.getByRole("button", { name: "Conferma chiusura" })).toBeDisabled();
    expect(sessionAction).not.toHaveBeenCalled();
  });
  it("fails closed if the state cannot be read and offers no commands to a technical reader", async () => {
    vi.mocked(loadBoardSession).mockRejectedValue(new Error("Database unavailable"));
    show();
    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: "Chiudi seduta" })).not.toBeInTheDocument();
    cleanup(); show(false);
    expect(screen.queryByRole("button", { name: "Chiudi seduta" })).not.toBeInTheDocument();
  });
});
