"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { httpsCallable } from "firebase/functions";
import { orderBy, limit } from "firebase/firestore";
import { toast } from "sonner";
import { Send, X } from "lucide-react";
import { functions } from "@/lib/firebase/config";
import { useFirestoreQuery } from "@/lib/hooks/useFirestoreQuery";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

type Audience = "all_users" | "all_trainers" | "specific";
type Role = "user" | "trainer";

interface Person {
  id: string;
  name?: string;
  fullName?: string;
  phoneNumber?: string;
}
interface Recipient {
  role: Role;
  id: string;
  label: string;
}
interface HistoryRow {
  id: string;
  title: string;
  body: string;
  audience: Audience;
  successCount?: number;
  failureCount?: number;
  sentByName?: string;
  createdAt?: { toDate: () => Date };
}

const AUDIENCE_LABEL: Record<Audience, string> = {
  all_users: "All users",
  all_trainers: "All trainers",
  specific: "Specific people",
};

const sendNotification = httpsCallable<
  { title: string; body: string; audience: Audience; recipients?: { role: Role; id: string }[] },
  { deviceCount: number; successCount: number; failureCount: number }
>(functions, "adminSendNotification");

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<Audience>("all_users");
  const [pickRole, setPickRole] = useState<Role>("user");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Recipient[]>([]);
  const [sending, setSending] = useState(false);

  const isSpecific = audience === "specific";
  const { data: users } = useFirestoreQuery<Person>(["notif-users"], "users", [], {
    enabled: isSpecific && pickRole === "user",
  });
  const { data: trainers } = useFirestoreQuery<Person>(["notif-trainers"], "trainers", [], {
    enabled: isSpecific && pickRole === "trainer",
  });
  const { data: history, isLoading: historyLoading } = useFirestoreQuery<HistoryRow>(
    ["admin-notifications"],
    "adminNotifications",
    [orderBy("createdAt", "desc"), limit(50)]
  );

  const matches = useMemo(() => {
    const list = (pickRole === "user" ? users : trainers) ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return list
      .filter((p) => {
        const n = (p.name || p.fullName || "").toLowerCase();
        return n.includes(q) || (p.phoneNumber || "").includes(q);
      })
      .slice(0, 8);
  }, [pickRole, users, trainers, search]);

  const addPerson = (p: Person) => {
    if (selected.some((s) => s.role === pickRole && s.id === p.id)) return;
    setSelected([
      ...selected,
      { role: pickRole, id: p.id, label: p.name || p.fullName || p.phoneNumber || p.id },
    ]);
    setSearch("");
  };

  const canSend =
    title.trim() && body.trim() && (!isSpecific || selected.length > 0) && !sending;

  const handleSend = async () => {
    const target = isSpecific
      ? `${selected.length} selected recipient(s)`
      : AUDIENCE_LABEL[audience].toLowerCase();
    if (!window.confirm(`Send "${title.trim()}" to ${target}?`)) return;

    setSending(true);
    try {
      const res = await sendNotification({
        title: title.trim(),
        body: body.trim(),
        audience,
        recipients: isSpecific
          ? selected.map(({ role, id }) => ({ role, id }))
          : undefined,
      });
      const { deviceCount, successCount, failureCount } = res.data;
      if (deviceCount === 0) {
        toast.warning("No registered devices for this audience.");
      } else {
        toast.success(`Delivered to ${successCount} of ${deviceCount} devices (${failureCount} failed).`);
      }
      setTitle("");
      setBody("");
      setSelected([]);
      queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send notification.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Push Notifications</h1>
        <p className="text-sm text-muted-foreground">
          Send a custom notification to users, trainers, or specific people.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compose</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Audience</Label>
            <Select value={audience} onValueChange={(v) => setAudience(v as Audience)}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(AUDIENCE_LABEL) as Audience[]).map((a) => (
                  <SelectItem key={a} value={a}>
                    {AUDIENCE_LABEL[a]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isSpecific && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Select value={pickRole} onValueChange={(v) => setPickRole(v as Role)}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="trainer">Trainer</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Search by name or phone..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {matches.length > 0 && (
                <div className="rounded-md border divide-y">
                  {matches.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addPerson(p)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                    >
                      {p.name || p.fullName || "Unnamed"}{" "}
                      <span className="text-muted-foreground">{p.phoneNumber}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {selected.map((s) => (
                  <Badge key={`${s.role}-${s.id}`} variant="secondary" className="gap-1">
                    {s.label} ({s.role})
                    <button
                      type="button"
                      aria-label={`Remove ${s.label}`}
                      onClick={() => setSelected(selected.filter((x) => x !== s))}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notif-title">Title ({title.length}/65)</Label>
            <Input
              id="notif-title"
              maxLength={65}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notif-body">Message ({body.length}/240)</Label>
            <Textarea
              id="notif-body"
              maxLength={240}
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>

          <Button onClick={handleSend} disabled={!canSend}>
            <Send className="mr-2 h-4 w-4" />
            {sending ? "Sending..." : "Send notification"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">History</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sent</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Audience</TableHead>
                <TableHead>Delivered</TableHead>
                <TableHead>By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historyLoading && (
                <TableRow>
                  <TableCell colSpan={5}>Loading...</TableCell>
                </TableRow>
              )}
              {!historyLoading && !history?.length && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    Nothing sent yet.
                  </TableCell>
                </TableRow>
              )}
              {history?.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {h.createdAt?.toDate().toLocaleString() ?? "-"}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-sm">{h.title}</div>
                    <div className="text-xs text-muted-foreground">{h.body}</div>
                  </TableCell>
                  <TableCell>{AUDIENCE_LABEL[h.audience] ?? h.audience}</TableCell>
                  <TableCell className="text-sm">
                    {h.successCount ?? 0} ok / {h.failureCount ?? 0} failed
                  </TableCell>
                  <TableCell className="text-sm">{h.sentByName ?? "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
