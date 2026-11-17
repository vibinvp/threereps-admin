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
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PaymentSession } from "@/types";
import { toast } from "sonner";
import { downloadCsv, toDate } from "@/lib/csv";
import { Search, RotateCcw, CreditCard, Download } from "lucide-react";
import Link from "next/link";

export default function PaymentsPage() {
  const { data: payments, isLoading } = useFirestoreQuery<PaymentSession>(
    ['payment_sessions'], 
    'payment_sessions',
    []
  );
  
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPayment, setSelectedPayment] = useState<PaymentSession | null>(null);
  const [isRefundOpen, setIsRefundOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const filteredPayments = useMemo(() => {
    if (!payments) return [];
    return payments.filter(payment => {
      const lowerQuery = searchQuery.toLowerCase();
      return (
        payment.razorpayPaymentId?.toLowerCase().includes(lowerQuery) ||
        payment.razorpayOrderId?.toLowerCase().includes(lowerQuery) ||
        payment.userId.toLowerCase().includes(lowerQuery)
      );
    });
  }, [payments, searchQuery]);

  const handleRefund = async () => {
    if (!selectedPayment) return;
    if (!reason.trim()) { toast.error("A reason is required."); return; }
    setIsProcessing(true);
    try {
      const refund = httpsCallable(functions, "adminRefundPayment");
      await refund({ paymentSessionId: selectedPayment.id, reason: reason.trim() });
      toast.success("Refund queued. The status updates once the refund worker processes it.");
      queryClient.invalidateQueries({ queryKey: ["payment_sessions"] });
      setIsRefundOpen(false);
      setSelectedPayment(null);
      setReason("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to queue refund.");
    } finally {
      setIsProcessing(false);
    }
  };

  const openRefundDialog = (payment: PaymentSession) => {
    setSelectedPayment(payment);
    setIsRefundOpen(true);
  };

  const columns: ColumnDef<PaymentSession>[] = [
    {
      accessorKey: "createdAt",
      header: "Date",
      cell: ({ row }) => {
        const ts = row.original.createdAt;
        const date = ts?.toDate ? ts.toDate() : new Date(ts || Date.now());
        return <span className="text-sm font-medium">{date.toLocaleDateString()}</span>;
      }
    },
    {
      accessorKey: "userId",
      header: "User ID",
      cell: ({ row }) => <span className="text-xs font-mono">{row.original.userId.slice(0, 8)}</span>
    },
    {
      accessorKey: "razorpayPaymentId",
      header: "Payment ID",
      cell: ({ row }) => <span className="text-xs font-mono text-muted-foreground">{row.original.razorpayPaymentId || 'N/A'}</span>
    },
    {
      accessorKey: "amount",
      header: "Amount",
      cell: ({ row }) => <span className="text-sm font-bold">₹{row.original.amount}</span>
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const s = row.original.status;
        let v = "default";
        if (s === "Failed") v = "destructive";
        if (s === "Refunded") v = "secondary";
        if (s === "Pending") v = "outline";
        return <Badge variant={v as any}>{s}</Badge>;
      }
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <div className="flex gap-2 justify-end">
          {row.original.status === 'Captured' && (
            <Button variant="outline" size="sm" onClick={() => openRefundDialog(row.original)}>
              <RotateCcw className="h-4 w-4 mr-2" /> Refund
            </Button>
          )}
        </div>
      )
    }
  ];

  const table = useReactTable({
    data: filteredPayments,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payment Sessions</h1>
          <p className="text-muted-foreground">Track Razorpay transactions and issue manual refunds.</p>
        </div>
        <Button variant="outline" disabled={!filteredPayments.length} onClick={() => downloadCsv(
          `payments-${new Date().toISOString().slice(0, 10)}.csv`,
          ["Date", "Payment ID", "Order ID", "User ID", "Amount", "Status"],
          filteredPayments.map(p => [toDate(p.createdAt), p.razorpayPaymentId, p.razorpayOrderId, p.userId, p.amount, p.status])
        )}>
          <Download className="h-4 w-4 mr-2" /> Export CSV
        </Button>
        <Link href="/dashboard/ledger" className={buttonVariants()}>
          <CreditCard className="h-4 w-4 mr-2" /> View Full Ledger
        </Link>
      </div>

      <div className="relative w-full sm:w-96">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by Payment ID, Order ID, or User ID..."
          className="pl-8"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
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
                  No payment sessions found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isRefundOpen} onOpenChange={setIsRefundOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue Refund</DialogTitle>
            <DialogDescription>
              This queues a refund for the booking that owns this payment. The refund worker processes it via Razorpay; it is logged in the audit trail.
            </DialogDescription>
          </DialogHeader>
          {selectedPayment && (
            <div className="py-4 space-y-2 text-sm bg-muted/50 p-4 rounded-md">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment ID:</span>
                <span className="font-mono">{selectedPayment.razorpayPaymentId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount:</span>
                <span className="font-bold">₹{selectedPayment.amount}</span>
              </div>
            </div>
          )}
          <Textarea placeholder="Reason for refund (required)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={5000} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRefundOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRefund} disabled={isProcessing || !reason.trim()}>
              {isProcessing ? 'Queuing...' : 'Queue Refund'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
