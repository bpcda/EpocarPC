import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import ShootingAgenda from "@/components/admin/ShootingAgenda";

const api = vi.hoisted(() => ({rpc:vi.fn(), functions:{invoke:vi.fn()}}));
vi.mock("@/integrations/supabase/client", () => ({supabase:api}));

it("assegna solo lo slot scelto e conserva la conferma se la mail fallisce",async()=>{
  const day="2026-12-03", slot="s1";
  let confirmed=false;
  api.rpc.mockImplementation(async(name,args)=>{
    if(name==="shooting_calendar_status") return {data: confirmed ? 1 : 0};
    if(name==="shooting_schedule") {
      expect(args).toEqual({p_id:"r1",p_revision:0,p_slot:slot});
      confirmed=true;
      return {error:null};
    }
    return {data:{evenings:[{day,meeting_place:"Piacenza"}],slots:[{id:slot,day,starts:"18:30:00",capacity:1}],
      requests:[{id:"r1",day,brand:"Marca",model:"Modello",kind:"auto",state:confirmed?"confirmed":"pending",
        revision:confirmed?1:0,slot_id:confirmed?slot:null,appointment:confirmed?"Piacenza · 18:30":null,delivery_state:"pending"}]}};
  });
  api.functions.invoke.mockResolvedValue({error:{message:"indisponibile"}});
  render(<QueryClientProvider client={new QueryClient()}><ShootingAgenda owner="admin" /></QueryClientProvider>);
  const assign=await screen.findByLabelText("Assegna appuntamento");
  expect(api.rpc).not.toHaveBeenCalledWith("shooting_schedule",expect.anything());
  fireEvent.change(assign,{target:{value:slot}});
  fireEvent.click(screen.getByRole("button",{name:"Conferma appuntamento"}));
  await waitFor(()=>expect(screen.getByText("Piacenza · 18:30")).toBeInTheDocument());
  expect(screen.getByText(/Controlla le email rimaste in coda/)).toBeInTheDocument();
  expect(api.functions.invoke).toHaveBeenCalledWith("shooting-calendar", { body: {} });
  fireEvent.click(screen.getByRole("button", { name: "Shooting · Agenda" }));
  expect(await screen.findByText("Modifiche da sincronizzare: 1.")).toBeVisible();
  api.functions.invoke.mockResolvedValueOnce({ data: { state: "more" } }).mockResolvedValueOnce({ data: { state: "synced" } });
  fireEvent.click(await screen.findByRole("button", { name: "Sincronizza con Google" }));
  await screen.findByText("Google Calendar aggiornato.");
});

it("genera gli intervalli della serata selezionata solo se rientrano nella fascia", async () => {
  const day = "2026-12-03";
  api.rpc.mockImplementation(async (name) => name === "shooting_agenda"
    ? { data: { evenings: [{ day }], slots: [], requests: [] } }
    : { error: null });
  render(<QueryClientProvider client={new QueryClient()}><ShootingAgenda owner="admin" /></QueryClientProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "Shooting · Agenda" }));
  fireEvent.click(screen.getByText("Configura slot e capienza"));
  const save = await screen.findByRole("button", { name: "Genera e salva slot" });
  fireEvent.change(screen.getByLabelText("Minuti per slot"), { target: { value: "20" } });
  expect(save).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Numero di slot"), { target: { value: "3" } });
  expect(screen.getByText(/18:30–18:50 · 18:50–19:10 · 19:10–19:30/)).toBeInTheDocument();
  fireEvent.click(save);
  await waitFor(() => expect(api.rpc).toHaveBeenCalledWith("shooting_generate_slots", {
    p_day: day, p_start: "18:30", p_end: "19:45", p_count: 3, p_minutes: 20,
  }));
  await screen.findByText("Modifica salvata.");
});
