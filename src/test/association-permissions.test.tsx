import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AssociationTab from "@/components/admin/AssociationTab";

const role = vi.hoisted(() => ({ isAdmin: false }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => role }));
vi.mock("@/lib/association", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/association")>();
  return { ...actual, loadAssociation: async () => ({ documents: [], founders: [] }), associationClient: { from: () => ({ select: () => ({ order: () => ({ order: () => ({ range: async () => ({ data: [{ id:"11111111-1111-4111-8111-111111111111",user_id:"22222222-2222-4222-8222-222222222222",full_name:"Mario Rossi",email:"mario@example.org",file_path:"test/modulo.pdf",filename:"modulo.pdf",created_at:"2026-10-07T00:00:00Z" }], count: 1, error: null }) }) }) }) }) } };
});
afterEach(cleanup);
describe("association role controls", () => {
  it("staff can read applications and download but cannot upload or edit", async () => {
    role.isAdmin=false;render(<AssociationTab />);
    expect(await screen.findByText("Mario Rossi")).toBeInTheDocument();
    expect(screen.getByRole("button",{name:"Scarica"})).toBeEnabled();
    expect(screen.queryByRole("button",{name:"Carica"})).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Nome e cognome")).not.toBeInTheDocument();
  });
  it("admins can manage public materials and founders", async () => {
    role.isAdmin=true;render(<AssociationTab />);
    expect(await screen.findByText("Mario Rossi")).toBeInTheDocument();
    expect(screen.getAllByRole("button",{name:"Carica"})).toHaveLength(2);
    expect(screen.getByLabelText("Nome e cognome")).toBeInTheDocument();
    expect(screen.getByRole("button",{name:"Salva fondatore"})).toBeEnabled();
  });
});