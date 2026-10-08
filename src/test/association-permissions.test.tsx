import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AssociationTab from "@/components/admin/AssociationTab";

const role = vi.hoisted(() => ({ isAdmin: false }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => role }));
vi.mock("@/lib/association", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/association")>();
  return { ...actual, loadAssociation: async () => ({ documents: [] }), loadPeople: async () => [{ user_id:"33333333-3333-4333-8333-333333333333", first_name:"Anna", last_name:"Bianchi", avatar_url:null, roles:["founder","president"], sort_order:0, photo:null }], associationClient: { from: () => ({ select: () => ({ order: () => ({ order: () => ({ range: async () => ({ data: [{ id:"11111111-1111-4111-8111-111111111111",user_id:"22222222-2222-4222-8222-222222222222",full_name:"Mario Rossi",email:"mario@example.org",file_path:"test/modulo.pdf",filename:"modulo.pdf",created_at:"2026-10-07T00:00:00Z" }], count: 1, error: null }) }) }) }) }) } };
});
afterEach(cleanup);
describe("association role controls", () => {
  it("staff can read applications and download but cannot upload or edit", async () => {
    role.isAdmin=false;render(<AssociationTab />);
    expect(await screen.findByText("Mario Rossi")).toBeInTheDocument();
    expect(screen.getByRole("button",{name:"Scarica"})).toBeEnabled();
    expect(screen.queryByRole("button",{name:"Carica"})).not.toBeInTheDocument();
    expect(await screen.findByText("Anna Bianchi")).toBeInTheDocument();
    expect(screen.queryByLabelText("Ordine di Anna Bianchi")).not.toBeInTheDocument();
  });
  it("admins can manage public materials and only the order of people", async () => {
    role.isAdmin=true;render(<AssociationTab />);
    expect(await screen.findByText("Mario Rossi")).toBeInTheDocument();
    expect(screen.getAllByRole("button",{name:"Carica"})).toHaveLength(2);
    expect(await screen.findByLabelText("Ordine di Anna Bianchi")).toBeInTheDocument();
    expect(screen.getByText("Fondatore · Presidente")).toBeInTheDocument();
  });
});