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
});
