"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  collection,
  query as firestoreQuery,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  QueryConstraint,
  QueryDocumentSnapshot,
  DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight, Eye, Plus } from "lucide-react";
import { Booking } from "@/types";
import Link from "next/link";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { functions } from "@/lib/firebase/config";
import { httpsCallable } from "firebase/functions";
import { toast } from "sonner";

// Server-side status filter per tab, so a tab switch never has to pull the
// whole collection down just to filter it client-side.
const PAGE_SIZE = 20;
const STATUS_CONSTRAINTS: Record<string, QueryConstraint[]> = {
  All: [],
  Active: [where("bookingStatus", "in", ["confirmed", "active"])],
  Completed: [where("bookingStatus", "==", "completed")],
  Cancelled: [where("bookingStatus", "==", "cancelled")],
};

type BookingsPageResult = {
  items: Booking[];
  lastDoc?: QueryDocumentSnapshot<DocumentData>;
  hasMore: boolean;
};

export default function BookingsPage() {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState("All");
  const [pageIndex, setPageIndex] = useState(0);
  // Stack of cursors discovered so far for this tab: cursors[i] is the doc to
  // start after for page i (cursors[0] is undefined = start from the top).
  const [cursors, setCursors] = useState<(QueryDocumentSnapshot<DocumentData> | undefined)[]>([undefined]);

  // Deletion UI states

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setPageIndex(0);
    setCursors([undefined]);
  };

  const { data, isLoading, isFetching } = useQuery<BookingsPageResult>({
    queryKey: ["bookings", activeTab, pageIndex],
    queryFn: async () => {
      const cursorDoc = cursors[pageIndex];
      const constraints: QueryConstraint[] = [
        ...(STATUS_CONSTRAINTS[activeTab] || []),
        orderBy("createdAt", "desc"),
        ...(cursorDoc ? [startAfter(cursorDoc)] : []),
        // Fetch one extra doc so we know whether a next page exists, without
        // ever pulling the whole collection down.
        limit(PAGE_SIZE + 1),
      ];

      const snap = await getDocs(firestoreQuery(collection(db, "bookings"), ...constraints));
      const hasMore = snap.docs.length > PAGE_SIZE;
      const pageDocs = hasMore ? snap.docs.slice(0, PAGE_SIZE) : snap.docs;

      return {
        items: pageDocs.map((d) => ({ id: d.id, ...d.data() })) as Booking[],
        lastDoc: pageDocs[pageDocs.length - 1],
        hasMore,
      };
    },
    placeholderData: (prev) => prev,
  });

  const bookings = data?.items ?? [];
  const hasNextPage = data?.hasMore ?? false;

  // Once a page resolves, remember its last doc as the cursor for the next
  // page, so "Next" never has to re-derive it.
  useEffect(() => {
    if (data?.hasMore && data.lastDoc && cursors.length === pageIndex + 1) {
      setCursors((prev) => [...prev, data.lastDoc as QueryDocumentSnapshot<DocumentData>]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, pageIndex]);


  const columns: ColumnDef<Booking>[] = [
    {
      id: "ref",
      header: "Ref & Date",
      cell: ({ row }) => {
        const ref = row.original.bookingReference || row.original.id?.slice(0, 8) || "N/A";
        const dateObj = row.original.startDate || row.original.createdAt;
        let formattedDate = "N/A";
        if (dateObj) {
          try {
            formattedDate = typeof dateObj.toDate === 'function'
              ? dateObj.toDate().toLocaleDateString()
              : new Date(dateObj).toLocaleDateString();
          } catch (e) {
            console.error(e);
          }
        }
        return (
          <div className="flex flex-col">
            <span className="font-medium text-sm">{ref}</span>
            <span className="text-xs text-muted-foreground">{formattedDate}</span>
          </div>
        );
      }
    },
    {
      id: "client",
      header: "Client",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-sm font-medium">{row.original.userName}</span>
          <span className="text-xs text-muted-foreground">{row.original.userPhone || "N/A"}</span>
        </div>
      )
    },
    {
      id: "trainer",
      header: "Trainer",
      cell: ({ row }) => (
        <div className="flex flex-col items-start gap-1">
          <span className="text-sm font-medium">{row.original.trainerName}</span>
          {row.original.tier && (
            <Badge variant="outline" className="text-[10px] h-4 py-0">{row.original.tier}</Badge>
          )}
        </div>
      )
    },
    {
      id: "schedule",
      header: "Schedule",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.slotTime || "N/A"} ({row.original.sessionPattern || "N/A"})</span>
      )
    },
    {
      id: "progress",
      header: "Session Progress",
      cell: ({ row }) => {
        const completed = row.original.completedSessions || 0;
        const total = row.original.totalSessions || 0;
        const percentage = total > 0 ? Math.min(100, Math.max(0, (completed / total) * 100)) : 0;
        
        return (
          <div className="flex flex-col gap-1 min-w-[100px]">
            <span className="text-sm font-medium">{completed} / {total}</span>
            <div className="w-full bg-secondary rounded-full h-1.5">
              <div 
                className="bg-primary h-1.5 rounded-full" 
                style={{ width: `${percentage}%` }} 
              />
            </div>
          </div>
        );
      }
    },
    {
      id: "payment",
      header: "Payment",
      cell: ({ row }) => {
        const p = row.original.paymentStatus || "paid";
        return (
          <Badge 
            variant={p === 'failed' ? 'destructive' : 'default'} 
            className={p === 'refunded' ? 'bg-amber-500 hover:bg-amber-600' : p === 'paid' ? 'bg-green-500 hover:bg-green-600' : ''}
          >
            {p}
          </Badge>
        );
      }
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => {
        const s = row.original.bookingStatus || "confirmed";
        let v = "default";
        if (s === "pending") v = "secondary";
        if (s === "cancelled") v = "destructive";
        
        return (
          <Badge 
            variant={v as any} 
            className={s === 'confirmed' ? 'bg-blue-500 hover:bg-blue-600' : ''}
          >
            {s}
          </Badge>
        );
      }
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <Link href={`/dashboard/bookings/${row.original.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <Eye className="h-4 w-4 mr-2" /> Details
        </Link>
      )
    }
  ];

  const table = useReactTable({
    data: bookings,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const getFormattedDate = (dateObj: any) => {
    if (!dateObj) return "N/A";
    try {
      return typeof dateObj.toDate === 'function'
        ? dateObj.toDate().toLocaleDateString()
        : new Date(dateObj).toLocaleDateString();
    } catch (e) {
      return "N/A";
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Booking Engine</h1>
          <p className="text-muted-foreground">Manage lifecycles, monitor progress, and override assignments.</p>
        </div>
        <Link href="/dashboard/bookings/new" className={buttonVariants()}>
          <Plus className="h-4 w-4 mr-2" /> Manual Override
        </Link>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => v && handleTabChange(v)} className="w-full">
        <TabsList className="grid grid-cols-4 max-w-2xl">
          <TabsTrigger value="All">All</TabsTrigger>
          <TabsTrigger value="Active">Active</TabsTrigger>
          <TabsTrigger value="Completed">Completed</TabsTrigger>
          <TabsTrigger value="Cancelled">Cancelled</TabsTrigger>
        </TabsList>
      </Tabs>

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
                  No bookings found in this category.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          Page {pageIndex + 1}
          {isFetching && !isLoading ? " · Loading…" : ""}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
            disabled={pageIndex === 0 || isLoading}
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPageIndex((p) => p + 1)}
            disabled={!hasNextPage || isLoading}
          >
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
