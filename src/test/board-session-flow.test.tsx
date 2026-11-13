import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LiveSession from "@/components/board/LiveSession";
import { loadBoardSession, sessionAction, type Meeting } from "@/lib/board";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

vi.mock("@/components/board/DeliberationsPanel", () => ({ default: () => null }));
vi.mock("@/components/board/AudioPanel", () => ({ default: ({ onRecordingChange }: { onRecordingChange: (status: string) => void }) => <button onClick={() => onRecordingChange("Registrazione in corso")}>Avvia registrazione di prova</button> }));
vi.mock("@/components/board/MinutesPanel", () => ({ default: () => <input aria-label="Bozza del verbale" defaultValue="" /> }));
vi.mock("@/components/board/CorrectionsPanel", () => ({ default: () => <p>Rettifiche disponibili</p> }));
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
const session = { quorum: { total: 7, present: 4, required: 4, met: true }, events: [], minutesApproved: false, hasOpenBallot: false, openBallotId: null, openBallotMinutesId: null, chairUserId: "president", voterEligible: true };
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

describe("Focused Board workspace", () => {
  const openTab = (name: string) => fireEvent.mouseDown(screen.getByRole("tab", { name }));

  it("shows one workspace at a time and keeps the call and unsaved text when switching", async () => {
    show();
    await screen.findByText("Quorum raggiunto");
    expect(screen.getByRole("tab", { name: "Ordine del giorno" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("region", { name: "Presenze della seduta" })).not.toBeInTheDocument();
    const call = screen.getByRole("region", { name: "Stanza audio e video" });
    openTab("Verbale");
    fireEvent.change(screen.getByRole("textbox", { name: "Bozza del verbale" }), { target: { value: "Testo non ancora salvato" } });
    openTab("Presenze");
    expect(screen.getByRole("region", { name: "Stanza audio e video" })).toBe(call);
    expect(screen.queryByRole("textbox", { name: "Bozza del verbale" })).not.toBeInTheDocument();
    openTab("Verbale");
    expect(screen.getByRole("textbox", { name: "Bozza del verbale" })).toHaveValue("Testo non ancora salvato");
  });

  it("keeps a recording visible and reachable outside its workspace", async () => {
    show();
    await screen.findByText("Quorum raggiunto");
    openTab("Registrazione");
    fireEvent.click(screen.getByRole("button", { name: "Avvia registrazione di prova" }));
    openTab("Ordine del giorno");
    fireEvent.click(screen.getByRole("button", { name: "Registrazione in corso" }));
    expect(screen.getByRole("tab", { name: /Registrazione/ })).toHaveAttribute("aria-selected", "true");
  });

  it.each([null, "correction-minutes"])("takes an open ballot to its own workspace, including corrected minutes (%s)", async (minutesId) => {
    vi.mocked(loadBoardSession).mockResolvedValue({ ...session, hasOpenBallot: true, openBallotId: "ballot", openBallotMinutesId: minutesId });
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Vai alla votazione" }));
    expect(screen.getByRole("tab", { name: minutesId ? "Verbale" : "Delibere" })).toHaveAttribute("aria-selected", "true");
    if (minutesId) expect(screen.getByText("Rettifiche disponibili")).toBeVisible();
  });
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
