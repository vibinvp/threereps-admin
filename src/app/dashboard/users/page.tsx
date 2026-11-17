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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Eye, Search, UserMinus, UserCheck, Calendar, Phone, Mail } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface UserProfile {
  id: string;
  name?: string;
  fullName?: string;
  email: string;
  phoneNumber?: string;
  photoUrl?: string;
  status?: 'Active' | 'Suspended';
  createdAt?: any;
  deletedAt?: any;
  isDeleted?: boolean;
}

export default function UsersPage() {
  // Not every user document has `deletedAt`/`isDeleted` set (most never had
  // it touched), and Firestore's `== null` filter only matches documents
  // where the field is explicitly present and null — it skips documents
  // where the field is simply missing. So we fetch everyone and filter
  // soft-deleted users out client-side instead of filtering in the query.
  const { data: users, isLoading } = useFirestoreQuery<UserProfile>(
    ['users'],
    'users'
  );

  const { update } = useFirestoreMutation('users');

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const { data: userBookings, isLoading: isUserBookingsLoading } = useFirestoreQuery<any>(
    ['bookings', 'byUser', selectedUser?.id || ''],
    'bookings',
    selectedUser ? [where('userId', '==', selectedUser.id)] : [],
    { enabled: !!selectedUser }
  );

  const { data: userPayments, isLoading: isUserPaymentsLoading } = useFirestoreQuery<any>(
    ['payment_sessions', 'byUser', selectedUser?.id || ''],
    'payment_sessions',
    selectedUser ? [where('userId', '==', selectedUser.id)] : [],
    { enabled: !!selectedUser }
  );

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    return users.filter(user => {
      if (user.isDeleted || user.deletedAt) return false;
      const status = user.status || 'Active';
      const matchesStatus = statusFilter === "All" || status === statusFilter;
      const lowerQuery = searchQuery.toLowerCase();
      const uName = user.name || user.fullName || '';
      const matchesSearch =
        uName.toLowerCase().includes(lowerQuery) ||
        user.email?.toLowerCase().includes(lowerQuery) ||
        user.phoneNumber?.includes(lowerQuery);

      return matchesStatus && matchesSearch;
    });
  }, [users, searchQuery, statusFilter]);

  const handleOpenUser = (user: UserProfile) => {
    setSelectedUser(user);
    setIsSheetOpen(true);
  };

  const handleToggleStatus = async () => {
    if (!selectedUser) return;
    setIsUpdatingStatus(true);
    const newStatus = selectedUser.status === 'Active' ? 'Suspended' : 'Active';
    try {
      await update.mutateAsync({
        id: selectedUser.id,
        status: newStatus
      });
      setSelectedUser({ ...selectedUser, status: newStatus });
      toast.success(`User has been ${newStatus === 'Active' ? 'reactivated' : 'suspended'}`);
    } catch (error) {
      toast.error("Failed to update user status");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const columns: ColumnDef<UserProfile>[] = [
    {
      accessorKey: "name",
      header: "User",
      cell: ({ row }) => {
        const uName = row.original.name || row.original.fullName || "Unnamed User";
        return (
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9">
              <AvatarImage src={row.original.photoUrl} alt={uName} />
              <AvatarFallback>{uName.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="font-medium text-sm">{uName}</span>
              <span className="text-xs text-muted-foreground">{row.original.id.slice(0, 8)}</span>
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
      accessorKey: "phoneNumber",
      header: "Phone",
      cell: ({ row }) => <span className="text-sm">{row.original.phoneNumber || 'N/A'}</span>
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const s = row.original.status || 'Active';
        return (
          <Badge variant={s === 'Active' ? 'default' : 'destructive'} className="font-medium">
            {s}
          </Badge>
        );
      }
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" onClick={() => handleOpenUser(row.original)}>
          <Eye className="h-4 w-4 mr-2" /> View
        </Button>
      )
    }
  ];

  const table = useReactTable({
    data: filteredUsers,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">User Directory</h1>
        <p className="text-muted-foreground">Manage platform users, view history, and handle suspensions.</p>
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
              <SelectItem value="Suspended">Suspended</SelectItem>
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
                  No users found matching your search.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="sm:max-w-[600px] overflow-y-auto w-[90vw]">
          <SheetHeader className="pb-6 border-b">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={selectedUser?.photoUrl} />
                <AvatarFallback className="text-xl">{(selectedUser?.name || selectedUser?.fullName)?.charAt(0) || 'U'}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col gap-1">
                <SheetTitle className="text-2xl">{selectedUser?.name || selectedUser?.fullName || 'Unnamed User'}</SheetTitle>
                <div className="flex items-center gap-2">
                  <Badge variant={selectedUser?.status === 'Active' ? 'default' : 'destructive'}>
                    {selectedUser?.status || 'Active'}
                  </Badge>
                  <span className="text-xs font-mono text-muted-foreground ml-2">ID: {selectedUser?.id}</span>
                </div>
              </div>
            </div>
          </SheetHeader>

          {selectedUser && (
            <div className="py-6 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground flex items-center"><Mail className="h-3 w-3 mr-1"/> Email</span>
                  <p className="text-sm font-medium">{selectedUser.email}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground flex items-center"><Phone className="h-3 w-3 mr-1"/> Phone</span>
                  <p className="text-sm font-medium">{selectedUser.phoneNumber || 'Not provided'}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground flex items-center"><Calendar className="h-3 w-3 mr-1"/> Joined Date</span>
                  <p className="text-sm font-medium">
                    {selectedUser.createdAt?.toDate ? new Date(selectedUser.createdAt.toDate()).toLocaleDateString() : 'Unknown'}
                  </p>
                </div>
              </div>

              <Tabs defaultValue="bookings" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="bookings">Booking History ({userBookings?.length ?? 0})</TabsTrigger>
                  <TabsTrigger value="payments">Payments ({userPayments?.length ?? 0})</TabsTrigger>
                </TabsList>
                <TabsContent value="bookings" className="py-4 space-y-3">
                  {isUserBookingsLoading ? (
                    <>
                      <Skeleton className="h-14 w-full" />
                      <Skeleton className="h-14 w-full" />
                    </>
                  ) : !userBookings || userBookings.length === 0 ? (
                    <div className="text-center py-8 text-sm text-muted-foreground border border-dashed rounded-lg bg-muted/20">
                      No bookings found for this user.
                    </div>
                  ) : (
                    userBookings.map((b: any) => (
                      <div key={b.id} className="flex items-center justify-between border rounded-lg p-3">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{b.bookingReference || `#${b.id.slice(-6)}`} · {b.trainerName || 'Unassigned'}</span>
                          <span className="text-xs text-muted-foreground">
                            {b.createdAt?.toDate ? b.createdAt.toDate().toLocaleDateString() : 'Unknown date'} · {b.completedSessions ?? 0}/{b.totalSessions ?? 0} sessions
                          </span>
                        </div>
                        <Badge variant={b.bookingStatus === 'cancelled' ? 'destructive' : b.bookingStatus === 'completed' ? 'secondary' : 'default'}>
                          {b.bookingStatus || 'confirmed'}
                        </Badge>
                      </div>
                    ))
                  )}
                </TabsContent>
                <TabsContent value="payments" className="py-4 space-y-3">
                  {isUserPaymentsLoading ? (
                    <>
                      <Skeleton className="h-14 w-full" />
                      <Skeleton className="h-14 w-full" />
                    </>
                  ) : !userPayments || userPayments.length === 0 ? (
                    <div className="text-center py-8 text-sm text-muted-foreground border border-dashed rounded-lg bg-muted/20">
                      No payment history available for this user.
                    </div>
                  ) : (
                    userPayments.map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between border rounded-lg p-3">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">₹{(p.amount || 0).toLocaleString()}</span>
                          <span className="text-xs text-muted-foreground font-mono">{p.razorpayPaymentId || p.id}</span>
                        </div>
                        <Badge variant={p.status === 'Failed' ? 'destructive' : p.status === 'Refunded' ? 'secondary' : 'default'}>
                          {p.status}
                        </Badge>
                      </div>
                    ))
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}

          <SheetFooter className="absolute bottom-0 left-0 w-full p-6 border-t bg-background">
            <div className="flex justify-between items-center w-full">
              <Button 
                variant={selectedUser?.status === 'Active' ? 'destructive' : 'default'}
                onClick={handleToggleStatus}
                disabled={isUpdatingStatus}
              >
                {selectedUser?.status === 'Active' ? (
                  <><UserMinus className="h-4 w-4 mr-2"/> Suspend Account</>
                ) : (
                  <><UserCheck className="h-4 w-4 mr-2"/> Reactivate Account</>
                )}
              </Button>
              <Button variant="outline" onClick={() => setIsSheetOpen(false)}>Close</Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
