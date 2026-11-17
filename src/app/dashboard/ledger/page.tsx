"use client";

import { useState, useMemo } from "react";
import { useFirestoreQuery } from "@/lib/hooks/useFirestoreQuery";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/config";
import { useQueryClient } from "@tanstack/react-query";
import { Textarea } from "@/components/ui/textarea";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  getFilteredRowModel,
  ColumnDef
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Ledger } from "@/types";
import { toast } from "sonner";
import { downloadCsv, toDate } from "@/lib/csv";
import { Search, AlertTriangle, ArrowRightLeft, Download } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function LedgerPage() {
  const { data: ledgers, isLoading } = useFirestoreQuery<Ledger>(
    ['ledger'], 
    'ledger',
    []
  );

  const queryClient = useQueryClient();
  const [note, setNote] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [selectedLedger, setSelectedLedger] = useState<Ledger | null>(null);
  const [isRecoveryOpen, setIsRecoveryOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const filteredLedgers = useMemo(() => {
    if (!ledgers) return [];
    return ledgers.filter(ledger => {
      const matchesType = typeFilter === "All" || ledger.type === typeFilter.toLowerCase();
      const lowerQuery = searchQuery.toLowerCase();
      const matchesSearch = 
        ledger.transactionId.toLowerCase().includes(lowerQuery) ||
        ledger.userId.toLowerCase().includes(lowerQuery) ||
        (ledger.description || "").toLowerCase().includes(lowerQuery);
      
      return matchesType && matchesSearch;
    });
  }, [ledgers, searchQuery, typeFilter]);

  const handleRecovery = async () => {
    if (!selectedLedger) return;
    if (!note.trim()) { toast.error("A note is required."); return; }
    setIsProcessing(true);
    try {
      const flag = httpsCallable(functions, "adminFlagLedgerEntry");
      await flag({ ledgerId: selectedLedger.id, note: note.trim() });
      toast.success(`Transaction ${selectedLedger.transactionId} flagged for reconciliation.`);
      queryClient.invalidateQueries({ queryKey: ["ledger"] });
      setIsRecoveryOpen(false);
      setSelectedLedger(null);
      setNote("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to flag transaction.");
    } finally {
      setIsProcessing(false);
    }
  };

  const columns: ColumnDef<Ledger>[] = [
    {
      accessorKey: "createdAt",
      header: "Timestamp",
      cell: ({ row }) => {
        const ts = row.original.createdAt;
        const date = ts?.toDate ? ts.toDate() : new Date(ts || Date.now());
        return <span className="text-sm font-medium">{date.toLocaleString()}</span>;
      }
    },
    {
      accessorKey: "transactionId",
      header: "Txn ID",
      cell: ({ row }) => <span className="text-xs font-mono">{row.original.transactionId.slice(0, 12)}...</span>
    },
    {
      accessorKey: "userId",
      header: "User ID",
      cell: ({ row }) => <span className="text-xs font-mono text-muted-foreground">{row.original.userId.slice(0, 8)}...</span>
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => {
        const t = row.original.type;
        return <Badge variant="outline" className="capitalize">{t}</Badge>;
      }
    },
    {
      accessorKey: "amount",
      header: "Amount",
      cell: ({ row }) => {
        const t = row.original.type;
        const color = (t === 'credit' || t === 'recovery') ? 'text-green-600' : 'text-red-600';
        const prefix = (t === 'credit' || t === 'recovery') ? '+' : '-';
        return <span className={`text-sm font-bold ${color}`}>{prefix}₹{row.original.amount}</span>;
      }
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const s = row.original.status;
        let v = "default";
        if (s === "failed") v = "destructive";
        if (s === "pending") v = "secondary";
        return <Badge variant={v as any} className="capitalize">{s}</Badge>;
      }
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <div className="flex gap-2 justify-end">
          {row.original.status === 'failed' && (
            <Button variant="outline" size="sm" onClick={() => {
              setSelectedLedger(row.original);
              setIsRecoveryOpen(true);
            }}>
              <AlertTriangle className="h-4 w-4 mr-2 text-orange-500" /> Flag
            </Button>
          )}
        </div>
      )
    }
  ];

  const table = useReactTable({
    data: filteredLedgers,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Financial & Recovery Ledger</h1>
          <p className="text-muted-foreground">Comprehensive platform transactions and failure recovery tools.</p>
        </div>
        <Button variant="outline" disabled={!filteredLedgers.length} onClick={() => downloadCsv(
          `ledger-${new Date().toISOString().slice(0, 10)}.csv`,
          ["Timestamp", "Transaction ID", "Type", "Amount", "User ID", "Status", "Description"],
          filteredLedgers.map(l => [toDate(l.createdAt), l.transactionId, l.type, l.amount, l.userId, l.status, l.description])
        )}>
          <Download className="h-4 w-4 mr-2" /> Export CSV
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by Txn ID, User ID..."
            className="pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-[200px]">
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as string)}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Types</SelectItem>
              <SelectItem value="Credit">Credit</SelectItem>
              <SelectItem value="Debit">Debit</SelectItem>
              <SelectItem value="Refund">Refund</SelectItem>
              <SelectItem value="Recovery">Recovery</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32 text-center">
                  <div className="flex flex-col items-center justify-center space-y-4">
                    <Skeleton className="h-8 w-full max-w-3xl" />
                    <Skeleton className="h-8 w-full max-w-3xl" />
                  </div>
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                  No ledger entries found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isRecoveryOpen} onOpenChange={setIsRecoveryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Flag for Reconciliation</DialogTitle>
            <DialogDescription>
              Record a note on this transaction so it can be reconciled. This does not change its status or move money.
            </DialogDescription>
          </DialogHeader>
          {selectedLedger && (
            <div className="py-4 space-y-4">
              <div className="bg-orange-50 dark:bg-orange-950/20 text-orange-800 dark:text-orange-200 p-4 rounded-md text-sm flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <p>Verify the transaction in the Razorpay dashboard first. Actual recovery (webhook replay, slot release) is done in the booking backend.</p>
              </div>
              <div className="space-y-2 text-sm bg-muted/50 p-4 rounded-md">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Txn ID:</span>
                  <span className="font-mono">{selectedLedger.transactionId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type:</span>
                  <span className="capitalize font-medium">{selectedLedger.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount:</span>
                  <span className="font-bold">₹{selectedLedger.amount}</span>
                </div>
              </div>
            </div>
          )}
          <Textarea placeholder="What needs reconciling? (required)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRecoveryOpen(false)}>Cancel</Button>
            <Button onClick={handleRecovery} disabled={isProcessing || !note.trim()}>
              <ArrowRightLeft className="h-4 w-4 mr-2" />
              {isProcessing ? 'Saving...' : 'Flag Transaction'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
