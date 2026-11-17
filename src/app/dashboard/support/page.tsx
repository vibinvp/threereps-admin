"use client";

import { useState, useMemo } from "react";
import { useFirestoreQuery } from "@/lib/hooks/useFirestoreQuery";
import { useFirestoreMutation } from "@/lib/hooks/useFirestoreMutation";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  getFilteredRowModel,
  ColumnDef
} from "@tanstack/react-table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Eye } from "lucide-react";

interface SupportTicket {
  id: string;
  userEmail: string;
  subject: string;
  description: string;
  status: 'Pending' | 'In Progress' | 'Resolved';
  priority: 'Low' | 'Medium' | 'High';
  adminNotes?: string;
  createdAt?: any;
}

export default function SupportPage() {
  const { data: tickets, isLoading } = useFirestoreQuery<SupportTicket>(['support_tickets'], 'support_tickets');
  const { update } = useFirestoreMutation('support_tickets');

  const [activeTab, setActiveTab] = useState("All");
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const [adminNotes, setAdminNotes] = useState("");
  const [ticketStatus, setTicketStatus] = useState<'Pending' | 'In Progress' | 'Resolved'>('Pending');
  const [isSaving, setIsSaving] = useState(false);

  const filteredTickets = useMemo(() => {
    if (!tickets) return [];
    if (activeTab === "All") return tickets;
    return tickets.filter(t => t.status === activeTab);
  }, [tickets, activeTab]);

  const handleOpenTicket = (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setAdminNotes(ticket.adminNotes || "");
    setTicketStatus(ticket.status);
    setIsSheetOpen(true);
  };

  const handleSaveTicket = async () => {
    if (!selectedTicket) return;
    setIsSaving(true);
    try {
      await update.mutateAsync({
        id: selectedTicket.id,
        status: ticketStatus,
        adminNotes: adminNotes,
      });
      toast.success("Ticket updated successfully");
      setIsSheetOpen(false);
    } catch (error) {
      toast.error("Failed to update ticket");
    } finally {
      setIsSaving(false);
    }
  };

  const columns: ColumnDef<SupportTicket>[] = [
    {
      accessorKey: "id",
      header: "Ticket ID",
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.id.slice(0, 8)}</span>
    },
    {
      accessorKey: "userEmail",
      header: "User Email",
    },
    {
      accessorKey: "subject",
      header: "Subject",
      cell: ({ row }) => <span className="font-medium">{row.original.subject}</span>
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const s = row.original.status;
        return (
          <Badge variant={s === 'Resolved' ? 'default' : s === 'In Progress' ? 'secondary' : 'outline'}>
            {s}
          </Badge>
        );
      }
    },
    {
      accessorKey: "priority",
      header: "Priority",
      cell: ({ row }) => {
        const p = row.original.priority;
        return (
          <Badge variant={p === 'High' ? 'destructive' : 'outline'} className={p === 'Medium' ? 'bg-orange-100 text-orange-800 hover:bg-orange-100/80 border-transparent dark:bg-orange-900/30 dark:text-orange-400' : ''}>
            {p}
          </Badge>
        );
      }
    },
    {
      id: "actions",
      cell: ({ row }) => {
        return (
          <Button variant="ghost" size="sm" onClick={() => handleOpenTicket(row.original)}>
            <Eye className="h-4 w-4 mr-2" /> View
          </Button>
        );
      }
    }
  ];

  const table = useReactTable({
    data: filteredTickets,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Support Ticket Resolution</h1>
        <p className="text-muted-foreground">Manage user inquiries and support requests.</p>
      </div>

      <div className="flex justify-between items-center">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-[400px]">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="All">All</TabsTrigger>
            <TabsTrigger value="Pending">Pending</TabsTrigger>
            <TabsTrigger value="In Progress">Active</TabsTrigger>
            <TabsTrigger value="Resolved">Resolved</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24">
                  <div className="flex justify-center items-center h-full space-x-4">
                    <Skeleton className="h-4 w-[250px]" />
                    <Skeleton className="h-4 w-[200px]" />
                    <Skeleton className="h-4 w-[150px]" />
                  </div>
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No support tickets found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="sm:max-w-[500px] overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>Ticket #{selectedTicket?.id.slice(0, 8)}</SheetTitle>
            <SheetDescription>
              Submitted by {selectedTicket?.userEmail}
            </SheetDescription>
          </SheetHeader>
          
          {selectedTicket && (
            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-medium mb-1">Subject</h4>
                <p className="text-sm text-muted-foreground">{selectedTicket.subject}</p>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-1">Description</h4>
                <div className="p-3 bg-muted rounded-md text-sm whitespace-pre-wrap">
                  {selectedTicket.description}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium mb-1">Priority</h4>
                  <Badge variant={selectedTicket.priority === 'High' ? 'destructive' : 'outline'}>
                    {selectedTicket.priority}
                  </Badge>
                </div>
                <div>
                  <h4 className="text-sm font-medium mb-1">Current Status</h4>
                  <Badge variant={selectedTicket.status === 'Resolved' ? 'default' : selectedTicket.status === 'In Progress' ? 'secondary' : 'outline'}>
                    {selectedTicket.status}
                  </Badge>
                </div>
              </div>

              <div className="space-y-2 pt-4 border-t">
                <Label htmlFor="status">Update Status</Label>
                <Select value={ticketStatus} onValueChange={(val: any) => setTicketStatus(val)}>
                  <SelectTrigger id="status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                    <SelectItem value="Resolved">Resolved</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Admin Notes (Internal)</Label>
                <Textarea 
                  id="notes" 
                  placeholder="Add resolution notes here..." 
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  className="min-h-[100px]"
                />
              </div>
            </div>
          )}

          <SheetFooter className="mt-8">
            <Button variant="outline" onClick={() => setIsSheetOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveTicket} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
