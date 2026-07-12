"use client";

import { useState } from "react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuditLogs } from "@/hooks/use-audit";
import { ApiError } from "@/lib/api-client";

export default function ActivityPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error } = useAuditLogs({ page, limit: 25 });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Activity Log</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent actions</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          )}
          {isError && (
            <p className="py-8 text-center text-sm text-destructive">
              {error instanceof ApiError && error.status === 403
                ? "Only organization admins can view the activity log."
                : "Failed to load activity log."}
            </p>
          )}
          {data && data.data.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No activity recorded yet.
            </p>
          )}
          {data && data.data.length > 0 && (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.data.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium">{entry.action}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {entry.entityType}
                        {entry.entityId ? ` · ${entry.entityId.slice(0, 8)}…` : ""}
                      </TableCell>
                      <TableCell>
                        {entry.user?.displayName ?? entry.user?.email ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {entry.ipAddress ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(entry.createdAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between pt-4">
                <p className="text-sm text-muted-foreground">
                  Page {data.meta.page} of {Math.max(data.meta.totalPages, 1)} ·{" "}
                  {data.meta.total} total
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= data.meta.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
