"use client";

import { useFirestoreQuery } from "@/lib/hooks/useFirestoreQuery";
import { useFirestoreMutation } from "@/lib/hooks/useFirestoreMutation";
import { where } from "firebase/firestore";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
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
import { ArrowLeft, Check, X, FileText } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Link from "next/link";
import { Trainer } from "@/types";
import { toast } from "sonner";
import { useState } from "react";

export default function TrainerApplicationsPage() {
  const { data: trainers, isLoading } = useFirestoreQuery<Trainer>(
    ['trainer_applications'], 
    'trainers',
    [where('status', 'in', ['pending', 'new'])]
  );

  const { update } = useFirestoreMutation('trainers');
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  const handleQuickDecision = async (id: string, decision: 'active' | 'rejected') => {
    setIsUpdating(id);
    try {
      await update.mutateAsync({
        id,
        status: decision
      });
      toast.success(`Application has been ${decision === 'active' ? 'approved' : 'rejected'}`);
    } catch (error) {
      toast.error("Failed to update application status");
    } finally {
      setIsUpdating(null);
    }
  };

  const columns: ColumnDef<Trainer>[] = [
    {
      accessorKey: "name",
      header: "Applicant",
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
              <span className="text-xs text-muted-foreground">{row.original.email}</span>
            </div>
          </div>
        );
      }
    },
    {
      accessorKey: "experienceYears",
      header: "Experience",
      cell: ({ row }) => <span className="text-sm">{row.original.experienceYears} Years ({row.original.experienceLevel})</span>
    },
    {
      accessorKey: "specialization",
      header: "Specializations",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1 max-w-[200px]">
          {row.original.specialization?.map((spec: string) => (
            <Badge key={spec} variant="outline" className="text-[10px]">
              {spec}
            </Badge>
          )) || <span className="text-xs text-muted-foreground">None</span>}
        </div>
      )
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const loading = isUpdating === row.original.id;
        return (
          <div className="flex items-center gap-2">
            <Link href={`/dashboard/trainers/${row.original.id}/review`} className={buttonVariants()}>
              <FileText className="h-4 w-4 mr-1" /> Review Full Profile
            </Link>
            <Button 
              variant="default" 
              size="sm"
              disabled={loading}
              onClick={() => handleQuickDecision(row.original.id!, 'active')}
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button 
              variant="destructive" 
              size="sm"
              disabled={loading}
              onClick={() => handleQuickDecision(row.original.id!, 'rejected')}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )
      }
    }
  ];

  const table = useReactTable({
    data: trainers || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/trainers" className={buttonVariants()}>
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Trainer Applications</h1>
          <p className="text-muted-foreground">Review and approve pending trainer verification requests.</p>
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
                  No pending applications.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
