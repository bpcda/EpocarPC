import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ChevronLeft, ChevronRight, Search, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

type Role = "admin" | "staff" | "user";

interface UserRow {
  user_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  created_at: string;
  roles: Role[];
  total_count: number;
}

const PAGE_SIZE = 20;

export default function UsersTab() {
  const { user: currentUser } = useAuth();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [updating, setUpdating] = useState<string | null>(null);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_list_users", {
      _search: debounced,
      _limit: PAGE_SIZE,
      _offset: (page - 1) * PAGE_SIZE,
    });
    if (error) {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
      setRows([]);
      setTotal(0);
    } else {
      const list = (data ?? []) as UserRow[];
      setRows(list);
      setTotal(list[0]?.total_count ?? 0);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, page]);

  const toggleRole = async (userId: string, role: Role, grant: boolean) => {
    setUpdating(`${userId}:${role}`);
    const { error } = await supabase.rpc("admin_set_user_role", {
      _user_id: userId,
      _role: role,
      _grant: grant,
    });
    setUpdating(null);
    if (error) {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: grant ? "Ruolo assegnato" : "Ruolo rimosso",
      description: `${role} → ${grant ? "concesso" : "revocato"}`,
    });
    fetchUsers();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <h2 className="text-lg font-headline font-medium text-foreground">Utenti</h2>
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca per nome o email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="hidden md:table-cell">Registrato</TableHead>
              <TableHead className="w-64">Ruoli</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin inline text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-12 text-muted-foreground text-sm">
                  Nessun utente trovato.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => {
                const isAdmin = r.roles.includes("admin");
                const isStaff = r.roles.includes("staff");
                const isSelf = r.user_id === currentUser?.id;
                const fullName = [r.first_name, r.last_name].filter(Boolean).join(" ") || "—";
                return (
                  <TableRow key={r.user_id}>
                    <TableCell className="font-medium">
                      {fullName}
                      {isSelf && (
                        <span className="ml-2 text-xs text-muted-foreground">(tu)</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{r.email || "—"}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                      {new Date(r.created_at).toLocaleDateString("it-IT", {
                        day: "numeric", month: "short", year: "numeric",
                      })}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2 flex-wrap">
                        <RoleToggle
                          label="admin"
                          active={isAdmin}
                          disabled={isSelf && isAdmin /* prevent self-lockout */}
                          loading={updating === `${r.user_id}:admin`}
                          onClick={() => toggleRole(r.user_id, "admin", !isAdmin)}
                        />
                        <RoleToggle
                          label="staff"
                          active={isStaff}
                          loading={updating === `${r.user_id}:staff`}
                          onClick={() => toggleRole(r.user_id, "staff", !isStaff)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
        <span>
          {total > 0
            ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} di ${total}`
            : "0 risultati"}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span>
            Pag. {page} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function RoleToggle({
  label, active, disabled, loading, onClick,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={onClick}
      title={disabled ? "Non puoi rimuovere il tuo ruolo admin" : active ? "Clicca per revocare" : "Clicca per assegnare"}
      className={`text-xs uppercase tracking-wider px-2 py-1 border transition-colors ${
        active
          ? "bg-accent text-accent-foreground border-accent"
          : "bg-transparent text-muted-foreground border-border hover:border-accent hover:text-foreground"
      } ${disabled || loading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      {loading ? "…" : label}
    </button>
  );
}