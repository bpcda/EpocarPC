import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ChevronLeft, ChevronRight, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface AuditRow {
  id: string;
  created_at: string;
  action: "grant" | "revoke";
  role: string;
  previous_state: string;
  new_state: string;
  changed_by: string;
  changed_by_email: string | null;
  changed_by_name: string | null;
  target_user: string;
  target_email: string | null;
  target_name: string | null;
  total_count: number;
}

const PAGE_SIZE = 50;

export default function RoleAuditTab() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / PAGE_SIZE)),
    [total]
  );

  const fetchLog = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_list_role_audit", {
      _limit: PAGE_SIZE,
      _offset: (page - 1) * PAGE_SIZE,
    });
    if (error) {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
      setRows([]);
      setTotal(0);
    } else {
      const list = (data ?? []) as AuditRow[];
      setRows(list);
      setTotal(list[0]?.total_count ?? 0);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <h2 className="text-lg font-headline font-medium text-foreground">
          Audit cambi ruolo
        </h2>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldAlert className="h-4 w-4" />
          Registro immutabile — rimovibile solo via SQL dal sys admin.
        </div>
      </div>

      <div className="border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Azione</TableHead>
              <TableHead>Ruolo</TableHead>
              <TableHead>Utente modificato</TableHead>
              <TableHead>Modificato da</TableHead>
              <TableHead className="hidden md:table-cell">Transizione</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin inline text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground text-sm">
                  Nessuna modifica registrata.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString("it-IT", {
                      day: "2-digit", month: "short", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`text-xs uppercase tracking-wider px-2 py-1 border ${
                        r.action === "grant"
                          ? "border-accent text-accent"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      {r.action === "grant" ? "assegnato" : "revocato"}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs uppercase tracking-wider">{r.role}</TableCell>
                  <TableCell className="text-sm">
                    <div className="font-medium">{r.target_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.target_email || r.target_user}</div>
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="font-medium">{r.changed_by_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.changed_by_email || r.changed_by}</div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                    {r.previous_state} → {r.new_state}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
        <span>
          {total > 0
            ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} di ${total}`
            : "0 voci"}
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