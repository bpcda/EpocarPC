import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DossierPanel from "@/components/board/DossierPanel";
import { archiveDossier, downloadDossier, loadLatestDossier } from "@/lib/board-dossier";
import type { Meeting } from "@/lib/board";

vi.mock("@/lib/board-dossier", () => ({
  archiveDossier: vi.fn(), createDossier: vi.fn(), downloadDossier: vi.fn(), loadLatestDossier: vi.fn(),
}));
vi.mock("@/lib/board-docx", () => ({ downloadBlob: vi.fn() }));
const dossier = { id: "00000000-0000-4000-8000-000000000001", meeting_id: "00000000-0000-4000-8000-000000000002", storage_path: "test/file.zip", sha256: "0".repeat(64), created_at: "2026-11-12T10:00:00Z", verified_at: null, archived_at: null };
const meeting = { id: dossier.meeting_id, status: "VERBALE_IN_REVISIONE", meeting_number: 1, meeting_year: 2026 } as Meeting;
function show(manager: boolean, status = meeting.status) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><DossierPanel m={{ ...meeting, status }} manager={manager} /></QueryClientProvider>);
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadLatestDossier).mockResolvedValue(dossier);
  vi.mocked(downloadDossier).mockResolvedValue(new Blob(["zip"]));
  vi.mocked(archiveDossier).mockResolvedValue();
});
afterEach(cleanup);

describe("Fascicolo controls", () => {
  it("lets read-only users download but never generate or archive", async () => {
    show(false);
    expect(await screen.findByRole("button", { name: "Scarica fascicolo ZIP" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Rigenera|Prepara|Archivia/ })).not.toBeInTheDocument();
  });
  it("requires a successful download and an explicit confirmation before deleting temporary media", async () => {
    show(true);
    const archive = await screen.findByRole("button", { name: "Archivia seduta" });
    expect(archive).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Scarica fascicolo ZIP" }));
    await waitFor(() => expect(archive).toBeEnabled());
    fireEvent.click(archive);
    const confirm = screen.getByRole("button", { name: "Conferma archivio ed elimina audio e trascrizioni" });
    expect(confirm).toBeDisabled(); expect(archiveDossier).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(confirm);
    await waitFor(() => expect(archiveDossier).toHaveBeenCalledWith(dossier.id));
  });
  it("keeps archiving disabled after an integrity or download failure", async () => {
    vi.mocked(downloadDossier).mockRejectedValueOnce(new Error("Impronta non corrispondente"));
    show(true);
    fireEvent.click(await screen.findByRole("button", { name: "Scarica fascicolo ZIP" }));
    await waitFor(() => expect(downloadDossier).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Archivia seduta" })).toBeDisabled();
    expect(archiveDossier).not.toHaveBeenCalled();
  });
  it("offers retry for incomplete cleanup and keeps archived meetings read-only", async () => {
    show(true, "ESPORTATO");
    expect(await screen.findByRole("button", { name: "Riprendi archiviazione" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Rigenera fascicolo" })).not.toBeInTheDocument();
    cleanup(); show(true, "ARCHIVIATO");
    await screen.findByRole("button", { name: "Scarica fascicolo ZIP" });
    expect(screen.queryByRole("button", { name: /Archivia seduta|Riprendi archiviazione|Rigenera fascicolo/ })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Seduta archiviata");
  });
});
