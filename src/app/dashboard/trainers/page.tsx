"use client";

import { useState, useMemo } from "react";
import { useFirestoreQuery } from "@/lib/hooks/useFirestoreQuery";
import { useFirestoreMutation } from "@/lib/hooks/useFirestoreMutation";
import { where } from "firebase/firestore";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  getFilteredRowModel,
  ColumnDef
} from "@tanstack/react-table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { toast } from "sonner";
import { Eye, Search } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Link from "next/link";
import { Trainer } from "@/types";

export default function TrainersPage() {
  const { data: trainers, isLoading } = useFirestoreQuery<Trainer>(
    ['trainers'], 
    'trainers',
    []
  );
  
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const filteredTrainers = useMemo(() => {
    if (!trainers) return [];
    return trainers.filter(trainer => {
      // Map trainer.status to our filters
      // active -> Active
      // rejected / isPaused -> Deactivated
      // pending / new -> Pending Verification
      let tStatus = "Deactivated";
      if (trainer.status === "active" && !trainer.isPaused) tStatus = "Active";
      if (trainer.status === "pending" || trainer.status === "new") tStatus = "Pending Verification";

      const matchesStatus = statusFilter === "All" || tStatus === statusFilter;
      const lowerQuery = searchQuery.toLowerCase();
      const tName = trainer.name || trainer.fullName || "Unnamed Trainer";
      const matchesSearch = 
        tName.toLowerCase().includes(lowerQuery) ||
        trainer.email?.toLowerCase().includes(lowerQuery) ||
        trainer.phoneNumber?.includes(lowerQuery);
      
      return matchesStatus && matchesSearch;
    });
  }, [trainers, searchQuery, statusFilter]);

  const columns: ColumnDef<Trainer>[] = [
    {
      accessorKey: "fullName",
      header: "Trainer",
      cell: ({ row }) => {
        const tName = row.original.name || row.original.fullName || "Unnamed Trainer";
        return (
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9">
              <AvatarImage src={row.original.photoUrl} alt={tName} />
              <AvatarFallback>{tName.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="font-medium text-sm">{tName}</span>
              <span className="text-xs text-muted-foreground">{row.original.phoneNumber || row.original.id?.slice(0, 8) || 'No Phone'}</span>
            </div>
          </div>
        );
      }
    },
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) => <span className="text-sm">{row.original.email}</span>
    },
    {
      accessorKey: "tier",
      header: "Tier",
      cell: ({ row }) => <span className="text-sm">{row.original.tier || 'N/A'}</span>
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        let s = "Deactivated";
        let v = "destructive";
        if (row.original.status === "active" && !row.original.isPaused) {
          s = "Active";
          v = "default";
        }
        if (row.original.status === "pending" || row.original.status === "new") {
          s = "Pending Verification";
          v = "secondary";
        }
        return (
          <div className="flex items-center gap-2">
            <Badge variant={v as any} className="font-medium">
              {s}
            </Badge>
            {row.original.isPaused && (
              <Badge variant="outline" className="text-muted-foreground">
                Paused
              </Badge>
            )}
          </div>
        );
      }
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <Link href={`/dashboard/trainers/${row.original.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Eye className="h-4 w-4 mr-2" /> View Profile
        </Link>
      )
    }
  ];

  const table = useReactTable({
    data: filteredTrainers,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Trainer Directory</h1>
          <p className="text-muted-foreground">Manage trainers, reviews, and availability.</p>
        </div>
        <Link href="/dashboard/trainers/applications" className={buttonVariants()}>Review Applications</Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or phone..."
            className="pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-[200px]">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v || "")}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Statuses</SelectItem>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Pending Verification">Pending Verification</SelectItem>
              <SelectItem value="Deactivated">Deactivated</SelectItem>
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
                    <Skeleton className="h-8 w-full max-w-3xl" />
                  </div>
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
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
                  No trainers found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
