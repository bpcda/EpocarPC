import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import DocumentWorkflow from "@/components/board/DocumentWorkflow";
import { loadDocumentWorkflow, requestDocuments } from "@/lib/board-workflow";
import type { Meeting } from "@/lib/board";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/board-workflow", () => ({ loadDocumentWorkflow: vi.fn(), requestDocuments: vi.fn(), cancelDocuments: vi.fn(), pairDocumentWorker: vi.fn(), revokeDocumentWorker: vi.fn(), reviewPackage: vi.fn() }));
vi.mock("@/lib/board-audio", () => ({ loadAudioData: vi.fn(async () => ({ tracks: [], consents: [], settings: null })) }));
const clients: QueryClient[] = [];
const meeting: Meeting = { id: "meeting", meeting_year: 2026, meeting_number: 1, scheduled_at: "2026-11-13T18:00:00Z", location: "Sala", mode: "presenza", video_link: null, description: null, urgency_reason: null, status: "VERBALE_IN_REVISIONE", status_reason: null, minute_taker_id: "taker", started_at: "2026-11-13T18:00:00Z", ended_at: "2026-11-13T19:00:00Z", board_meeting_participants: [], board_agenda_items: [] };
function show(manager = true) { const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(qc); render(<QueryClientProvider client={qc}><DocumentWorkflow m={meeting} manager={manager} /></QueryClientProvider>); }
beforeEach(() => { vi.clearAllMocks(); vi.mocked(loadDocumentWorkflow).mockResolvedValue({ jobs: [], worker: { paired: true, online: false } }); vi.mocked(requestDocuments).mockResolvedValue("job"); });
afterEach(() => { cleanup(); clients.splice(0).forEach(c => c.clear()); });
it("requires coverage confirmation and manual notes without audio, then queues after closure", async () => {
  show();
  const button = await screen.findByRole("button", { name: "Prepara documenti con Codex" });
  fireEvent.click(screen.getByRole("checkbox"));
  expect(button).toBeDisabled();
  fireEvent.change(screen.getByRole("textbox", { name: "Copertura delle fonti e integrazioni manuali" }), { target: { value: "Appunti verificati: discussione senza deliberazioni." } });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  await waitFor(() => expect(requestDocuments).toHaveBeenCalledWith("meeting", "Appunti verificati: discussione senza deliberazioni."));
  expect(screen.getByText(/PC non collegato/)).toBeInTheDocument();
});
it("provides no queue or pairing command to a reader", async () => {
  show(false);
  await screen.findByText(/PC non collegato/);
  expect(screen.queryByRole("button", { name: "Prepara documenti con Codex" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Collega questo PC" })).not.toBeInTheDocument();
});
