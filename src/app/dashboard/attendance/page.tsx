"use client";

import { useState, useMemo } from "react";
import { useFirestoreQuery } from "@/lib/hooks/useFirestoreQuery";
import { useQueryClient } from "@tanstack/react-query";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/config";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { QrCode, Search, Edit3, ShieldAlert } from "lucide-react";
import { Attendance } from "@/types";
import { toast } from "sonner";

export default function AttendancePage() {
  const { data: attendanceLogs, isLoading } = useFirestoreQuery<Attendance>(
    ['attendance'],
    'attendance',
    [] // We can add orderBy timestamp descending if required later
  );

  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [methodFilter, setMethodFilter] = useState("All");
  const [isOverrideOpen, setIsOverrideOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State for Manual Override. This calls the same adminMarkSessionAttendance
  // Cloud Function the per-booking "Mark Attendance" button uses, so the session
  // status and booking's completed/remaining counters stay in sync - a raw
  // Firestore write here would silently desync them.
  const [overrideData, setOverrideData] = useState({
    bookingId: "",
    sessionId: "",
    notes: ""
  });

  const filteredLogs = useMemo(() => {
    if (!attendanceLogs) return [];
    return attendanceLogs.filter(log => {
      const matchesMethod = methodFilter === "All" || log.verificationMethod === methodFilter;
      const lowerQuery = (searchQuery || "").toLowerCase();
      const matchesSearch = 
        log.userId.toLowerCase().includes(lowerQuery) ||
        log.trainerId.toLowerCase().includes(lowerQuery) ||
        log.sessionId.toLowerCase().includes(lowerQuery);
      
      return matchesMethod && matchesSearch;
    });
  }, [attendanceLogs, searchQuery, methodFilter]);

  const handleManualOverride = async () => {
    if (!overrideData.bookingId || !overrideData.sessionId) {
      toast.error("Please provide both the Booking ID and Session ID.");
      return;
    }

    setIsSubmitting(true);
    try {
      const adminMarkSessionAttendance = httpsCallable(functions, "adminMarkSessionAttendance");
      const res = await adminMarkSessionAttendance({
        bookingId: overrideData.bookingId.trim(),
        sessionId: overrideData.sessionId.trim(),
      });
      const data = res.data as { success?: boolean; message?: string; alreadyCompleted?: boolean };

      if (!data?.success) {
        throw new Error(data?.message || "Failed to mark attendance.");
      }

      toast.success(data.alreadyCompleted ? "Session was already marked." : "Attendance marked successfully.");
      setIsOverrideOpen(false);
      setOverrideData({ bookingId: "", sessionId: "", notes: "" });
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
    } catch (error: any) {
      toast.error(error?.details?.message || error?.message || "Failed to record manual override.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns: ColumnDef<Attendance>[] = [
    {
      accessorKey: "timestamp",
      header: "Timestamp",
      cell: ({ row }) => {
        // Handle firebase timestamps or ISO strings
        const ts = row.original.timestamp;
        const date = ts?.toDate ? ts.toDate() : new Date(ts || Date.now());
        return <span className="text-sm font-medium">{date.toLocaleString()}</span>;
      }
    },
    {
      accessorKey: "userId",
      header: "User ID",
      cell: ({ row }) => <span className="text-xs font-mono">{row.original.userId.slice(0, 8)}</span>
    },
    {
      accessorKey: "trainerId",
      header: "Trainer ID",
      cell: ({ row }) => <span className="text-xs font-mono">{row.original.trainerId.slice(0, 8)}</span>
    },
    {
      accessorKey: "sessionId",
      header: "Session ID",
      cell: ({ row }) => <span className="text-xs font-mono text-muted-foreground">{row.original.sessionId?.slice(0, 8) || 'N/A'}</span>
    },
    {
      accessorKey: "verificationMethod",
      header: "Method",
      cell: ({ row }) => {
        const isQR = row.original.verificationMethod === "QR Scan";
        return (
          <div className="flex items-center gap-2">
            {isQR ? <QrCode className="h-4 w-4 text-blue-500" /> : <ShieldAlert className="h-4 w-4 text-orange-500" />}
            <span className="text-sm">{row.original.verificationMethod}</span>
          </div>
        );
      }
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const s = row.original.status;
        let v = "default";
        if (s === "absent") v = "destructive";
        if (s === "late") v = "secondary";
        return <Badge variant={v as any} className="capitalize">{s}</Badge>;
      }
    },
  ];

  const table = useReactTable({
    data: filteredLogs,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Attendance Audit Log</h1>
          <p className="text-muted-foreground">Monitor real-time session verifications and handle overrides.</p>
        </div>
        
        <Dialog open={isOverrideOpen} onOpenChange={setIsOverrideOpen}>
          <DialogTrigger>
            <Button variant="outline" className="gap-2">
              <Edit3 className="h-4 w-4" /> Manual Override
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Force Attendance Record</DialogTitle>
              <DialogDescription>
                Manually mark a session's attendance when QR systems fail. This calls the same transactional
                function the per-booking "Mark Attendance" button uses, so the session status and the booking's
                completed/remaining counters stay in sync.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Booking Document ID <span className="text-red-500">*</span></Label>
                <Input
                  value={overrideData.bookingId}
                  onChange={e => setOverrideData({...overrideData, bookingId: e.target.value})}
                  placeholder="booking_id"
                />
              </div>
              <div className="space-y-2">
                <Label>Session Document ID <span className="text-red-500">*</span></Label>
                <Input
                  value={overrideData.sessionId}
                  onChange={e => setOverrideData({...overrideData, sessionId: e.target.value})}
                  placeholder="session_id"
                />
              </div>
              <div className="space-y-2">
                <Label>Notes (Optional)</Label>
                <Textarea
                  value={overrideData.notes}
                  onChange={e => setOverrideData({...overrideData, notes: e.target.value})}
                  placeholder="Reason for manual override..."
                  className="resize-none"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsOverrideOpen(false)}>Cancel</Button>
              <Button onClick={handleManualOverride} disabled={isSubmitting}>
                {isSubmitting ? 'Recording...' : 'Record Audit Log'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by ID (User, Trainer, Session)..."
            className="pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-[200px]">
          <Select value={methodFilter} onValueChange={v => setMethodFilter(v as string)}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by Method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Methods</SelectItem>
              <SelectItem value="QR Scan">QR Scan</SelectItem>
              <SelectItem value="Admin Manual">Admin Manual</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-md border bg-card overflow-hidden">
        <div className="max-h-[600px] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10 shadow-sm">
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
                    No attendance records found matching filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
