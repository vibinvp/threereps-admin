"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, UserCog, CalendarCheck, DollarSign, Activity, ClipboardList, LifeBuoy } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useFirestoreQuery, useFirestoreCount, useFirestoreSum } from "@/lib/hooks/useFirestoreQuery";
import { where, orderBy, limit } from "firebase/firestore";

const AreaChart = dynamic(() => import("recharts").then(mod => mod.AreaChart), { ssr: false });
const Area = dynamic(() => import("recharts").then(mod => mod.Area), { ssr: false });
const XAxis = dynamic(() => import("recharts").then(mod => mod.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then(mod => mod.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import("recharts").then(mod => mod.CartesianGrid), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then(mod => mod.Tooltip), { ssr: false });
const ResponsiveContainer = dynamic(() => import("recharts").then(mod => mod.ResponsiveContainer), { ssr: false });
const BarChart = dynamic(() => import("recharts").then(mod => mod.BarChart), { ssr: false });
const Bar = dynamic(() => import("recharts").then(mod => mod.Bar), { ssr: false });
const Legend = dynamic(() => import("recharts").then(mod => mod.Legend), { ssr: false });

export default function DashboardOverviewPage() {
  // Recent users, for the activity feed only — the KPI count below uses a
  // server-side aggregate instead of downloading the whole collection.
  const { data: recentUsersData, isLoading: usersLoading } = useFirestoreQuery<any>(
    ['users', 'recent'],
    'users',
    [orderBy('createdAt', 'desc'), limit(5)]
  );

  const { data: bookingsData, isLoading: bookingsLoading } = useFirestoreQuery<any>(
    ['bookings', 'recent'],
    'bookings',
    [orderBy('createdAt', 'desc'), limit(100)]
  );

  const { data: paymentsData, isLoading: paymentsLoading } = useFirestoreQuery<any>(
    ['payment_sessions', 'captured'],
    'payment_sessions',
    [where('status', '==', 'Captured')]
  );

  // KPI counts — server-side aggregates, so these don't scale with collection
  // size and don't depend on every document having a particular field set.
  const { data: totalUsersCount, isLoading: totalUsersLoading } = useFirestoreCount(
    ['users', 'count', 'all'],
    'users'
  );
  const { data: deletedUsersCount, isLoading: deletedUsersLoading } = useFirestoreCount(
    ['users', 'count', 'deleted'],
    'users',
    [where('isDeleted', '==', true)]
  );
  const { data: totalTrainersCount, isLoading: trainersCountLoading } = useFirestoreCount(
    ['trainers', 'count'],
    'trainers'
  );
  const { data: activeBookingsCountAgg, isLoading: activeBookingsLoading } = useFirestoreCount(
    ['bookings', 'count', 'confirmed'],
    'bookings',
    [where('bookingStatus', '==', 'confirmed')]
  );
  const { data: totalRevenueAgg, isLoading: revenueLoading } = useFirestoreSum(
    ['payment_sessions', 'sum', 'captured'],
    'payment_sessions',
    'amount',
    [where('status', '==', 'Captured')]
  );
  const { data: pendingApplicationsCountAgg, isLoading: pendingAppsLoading } = useFirestoreCount(
    ['trainers', 'count', 'pending'],
    'trainers',
    [where('status', 'in', ['pending', 'new'])]
  );
  const { data: openTicketsCountAgg, isLoading: openTicketsLoading } = useFirestoreCount(
    ['support_tickets', 'count', 'open'],
    'support_tickets',
    [where('status', 'in', ['Pending', 'In Progress'])]
  );

  const isLoading = usersLoading || bookingsLoading || paymentsLoading
    || totalUsersLoading || deletedUsersLoading || trainersCountLoading
    || activeBookingsLoading || revenueLoading || pendingAppsLoading || openTicketsLoading;

  const totalUsers = Math.max((totalUsersCount || 0) - (deletedUsersCount || 0), 0);
  const totalTrainers = totalTrainersCount || 0;
  const activeBookingsCount = activeBookingsCountAgg || 0;
  const totalRevenue = totalRevenueAgg || 0;
  const pendingApplicationsCount = pendingApplicationsCountAgg || 0;
  const openTicketsCount = openTicketsCountAgg || 0;

  const revenueData = useMemo(() => {
    if (!paymentsData) return [];
    
    const monthlyData: Record<string, number> = {
      Jan: 0, Feb: 0, Mar: 0, Apr: 0, May: 0, Jun: 0,
      Jul: 0, Aug: 0, Sep: 0, Oct: 0, Nov: 0, Dec: 0
    };

    paymentsData.forEach((payment: any) => {
      if (payment.createdAt) {
        const date = payment.createdAt?.toDate ? payment.createdAt.toDate() : new Date(payment.createdAt);
        if (date && !isNaN(date.getTime())) {
          const month = date.toLocaleString('default', { month: 'short' });
          if (monthlyData[month] !== undefined) {
            monthlyData[month] += (payment.amount || 0);
          }
        }
      }
    });

    return Object.keys(monthlyData).map(month => ({
      name: month,
      revenue: monthlyData[month]
    }));
  }, [paymentsData]);

  const bookingData = useMemo(() => {
    if (!bookingsData) return [];
    
    const days: Record<string, { active: number, completed: number, cancelled: number }> = {
      Mon: { active: 0, completed: 0, cancelled: 0 },
      Tue: { active: 0, completed: 0, cancelled: 0 },
      Wed: { active: 0, completed: 0, cancelled: 0 },
      Thu: { active: 0, completed: 0, cancelled: 0 },
      Fri: { active: 0, completed: 0, cancelled: 0 },
      Sat: { active: 0, completed: 0, cancelled: 0 },
      Sun: { active: 0, completed: 0, cancelled: 0 }
    };

    bookingsData.forEach((booking: any) => {
      if (booking.createdAt) {
        const date = booking.createdAt?.toDate ? booking.createdAt.toDate() : new Date(booking.createdAt);
        if (date && !isNaN(date.getTime())) {
          const day = date.toLocaleString('default', { weekday: 'short' });
          if (days[day] && booking.bookingStatus) {
            if (booking.bookingStatus === 'confirmed' || booking.bookingStatus === 'pending') days[day].active += 1;
            else if (booking.bookingStatus === 'completed') days[day].completed += 1;
            else if (booking.bookingStatus === 'cancelled') days[day].cancelled += 1;
          }
        }
      }
    });

    return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => ({
      name: day,
      ...days[day]
    }));
  }, [bookingsData]);

  const recentActivity = useMemo(() => {
    const activities: any[] = [];
    
    if (recentUsersData) {
      const recentUsers = recentUsersData
        .filter((u: any) => u.createdAt)
        .map((u: any) => ({
          id: `user-${u.id}`,
          type: 'user',
          message: `New user ${u.name || u.fullName || 'Unknown'} registered.`,
          date: u.createdAt?.toDate ? u.createdAt.toDate() : new Date(u.createdAt)
        }));
      activities.push(...recentUsers);
    }

    if (bookingsData) {
      const recentBookings = [...bookingsData]
        .filter((b: any) => b.createdAt)
        .slice(0, 5)
        .map((b: any) => ({
          id: `booking-${b.id}`,
          type: 'booking',
          message: `Booking ${b.bookingReference || `#${b.id.slice(-4)}`} for ${b.userName || 'a client'} is ${b.bookingStatus || 'confirmed'}.`,
          date: b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt)
        }));
      activities.push(...recentBookings);
    }

    if (paymentsData) {
      const recentPayments = [...paymentsData]
        .filter((p: any) => p.createdAt)
        .sort((a, b) => {
          const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime();
          const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime();
          return dateB - dateA;
        })
        .slice(0, 5)
        .map((p: any) => ({
          id: `payment-${p.id}`,
          type: 'payment',
          message: `Payment of ₹${(p.amount || 0).toLocaleString()} captured.`,
          date: p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt)
        }));
      activities.push(...recentPayments);
    }

    return activities.sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 5)
      .map(activity => {
        const diffInSeconds = Math.floor((new Date().getTime() - activity.date.getTime()) / 1000);
        let timeString = '';
        if (diffInSeconds < 60) timeString = 'just now';
        else if (diffInSeconds < 3600) timeString = `${Math.floor(diffInSeconds / 60)} mins ago`;
        else if (diffInSeconds < 86400) timeString = `${Math.floor(diffInSeconds / 3600)} hours ago`;
        else timeString = `${Math.floor(diffInSeconds / 86400)} days ago`;

        return {
          ...activity,
          time: timeString
        };
      });
  }, [recentUsersData, bookingsData, paymentsData]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8 overflow-x-hidden">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Overview Dashboard</h1>
        <p className="text-muted-foreground">Welcome back! Here's what's happening today.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <KPIWrapper isLoading={isLoading}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalUsers.toLocaleString()}</div>
            </CardContent>
          </Card>
        </KPIWrapper>

        <KPIWrapper isLoading={isLoading}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Trainers</CardTitle>
              <UserCog className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalTrainers.toLocaleString()}</div>
            </CardContent>
          </Card>
        </KPIWrapper>

        <KPIWrapper isLoading={isLoading}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Bookings</CardTitle>
              <CalendarCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeBookingsCount.toLocaleString()}</div>
            </CardContent>
          </Card>
        </KPIWrapper>

        <KPIWrapper isLoading={isLoading}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </CardContent>
          </Card>
        </KPIWrapper>
      </div>

      {/* Action Items */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        <KPIWrapper isLoading={isLoading}>
          <Link href="/dashboard/trainers/applications">
            <Card className="hover:border-primary/50 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending Trainer Applications</CardTitle>
                <ClipboardList className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{pendingApplicationsCount.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">Awaiting review</p>
              </CardContent>
            </Card>
          </Link>
        </KPIWrapper>

        <KPIWrapper isLoading={isLoading}>
          <Link href="/dashboard/support">
            <Card className="hover:border-primary/50 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Open Support Tickets</CardTitle>
                <LifeBuoy className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{openTicketsCount.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">Pending or in progress</p>
              </CardContent>
            </Card>
          </Link>
        </KPIWrapper>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Revenue Overview</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[300px] w-full rounded-xl" />
            ) : (
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Booking Volume</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[300px] w-full rounded-xl" />
            ) : (
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bookingData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                    <Tooltip cursor={{ fill: '#f3f4f6' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                    <Bar dataKey="active" stackId="a" fill="#3b82f6" radius={[0, 0, 4, 4]} />
                    <Bar dataKey="completed" stackId="a" fill="#10b981" />
                    <Bar dataKey="cancelled" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity Feed */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Activity className="h-5 w-5 mr-2 text-primary" /> Recent Activity Feed
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : recentActivity.length === 0 ? (
             <div className="text-center py-6 text-muted-foreground text-sm">
                No recent activity to show.
             </div>
          ) : (
            <div className="space-y-6">
              {recentActivity.map((activity, index) => (
                <div key={activity.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b last:border-0 pb-4 last:pb-0">
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                      activity.type === 'user' ? 'bg-blue-500' :
                      activity.type === 'ticket' ? 'bg-orange-500' :
                      activity.type === 'payment' ? 'bg-emerald-500' : 'bg-purple-500'
                    }`} />
                    <span className="text-sm font-medium">{activity.message}</span>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap pl-5 sm:pl-0">{activity.time}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KPIWrapper({ isLoading, children }: { isLoading: boolean, children: React.ReactNode }) {
  if (isLoading) return <Skeleton className="h-[120px] rounded-xl w-full" />;
  return <>{children}</>;
}
