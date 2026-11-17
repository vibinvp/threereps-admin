"use client";

import { useMemo, useState } from "react";
import { orderBy, limit } from "firebase/firestore";
import { Download, Search } from "lucide-react";
import { useFirestoreQuery } from "@/lib/hooks/useFirestoreQuery";
import { downloadCsv, toDate } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type AuditLog = {
  id: string;
  action?: string;
  entity?: string;
  entityId?: string;
  bookingReference?: string;
  adminName?: string;
  adminUid?: string;
  reason?: string;
  previousValue?: unknown;
  newValue?: unknown;
  createdAt?: unknown;
};

const show = (v: unknown) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));

export default function AuditLogsPage() {
  const { data, isLoading, error } = useFirestoreQuery<AuditLog>(
    ["audit_logs"],
    "audit_logs",
    [orderBy("createdAt", "desc"), limit(500)]
  );
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const needle = q.toLowerCase().trim();
    if (!needle) return data ?? [];
    return (data ?? []).filter((l) =>
      [l.action, l.entity, l.entityId, l.bookingReference, l.adminName, l.reason]
        .some((f) => f?.toLowerCase().includes(needle))
    );
  }, [data, q]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Audit Log</h1>
          <p className="text-muted-foreground">Admin actions recorded by Cloud Functions (latest 500).</p>
        </div>
        <Button
          variant="outline"
          disabled={!rows.length}
          onClick={() =>
            downloadCsv(
              `audit-log-${new Date().toISOString().slice(0, 10)}.csv`,
              ["Time", "Admin", "Action", "Entity", "Entity ID", "Booking Ref", "Reason", "Previous", "New"],
              rows.map((l) => [toDate(l.createdAt), l.adminName, l.action, l.entity, l.entityId, l.bookingReference, l.reason, show(l.previousValue), show(l.newValue)])
            )
          }
        >
          <Download className="h-4 w-4 mr-2" /> Export CSV
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search action, admin, entity, reason..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {error ? (
        <p className="text-sm text-destructive">Failed to load audit logs: {error.message}</p>
      ) : isLoading ? (
        <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : (
        <div className="rounded-md border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Change</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No audit entries found.</TableCell>
                </TableRow>
              ) : (
                rows.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="whitespace-nowrap text-sm">{toDate(l.createdAt)?.toLocaleString() ?? "—"}</TableCell>
                    <TableCell className="text-sm">{l.adminName ?? "—"}</TableCell>
                    <TableCell><Badge variant="secondary">{l.action ?? "—"}</Badge></TableCell>
                    <TableCell className="text-xs font-mono">{l.entity}{l.entityId ? ` / ${l.entityId.slice(0, 10)}` : ""}</TableCell>
                    <TableCell className="text-xs">{show(l.previousValue) || "—"} → {show(l.newValue) || "—"}</TableCell>
                    <TableCell className="text-sm max-w-xs truncate" title={l.reason}>{l.reason ?? "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
