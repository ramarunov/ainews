"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCreateWorkflow, useWorkflows } from "@/hooks/use-workflow";
import { WorkflowBoard } from "@/components/workflow-board";
import { hasPermission, useAuthStore } from "@/lib/auth-store";
import { apiClient, ApiError } from "@/lib/api-client";
import { useQueryClient } from "@tanstack/react-query";

const DEFAULT_STAGES = [
  { name: "In Review", color: "#f59e0b" },
  { name: "SEO Check", color: "#8b5cf6" },
  { name: "Ready to Publish", color: "#22c55e" },
];

function FirstRunSetup() {
  const [name, setName] = useState("Editorial Workflow");
  const [submitting, setSubmitting] = useState(false);
  const createWorkflow = useCreateWorkflow();
  const queryClient = useQueryClient();

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const workflow = await createWorkflow.mutateAsync({ name: name.trim(), isDefault: true });
      // Plain sequential API calls here rather than useAddStage(workflow.id)
      // — hooks can't be created inside an event handler once the id only
      // becomes known at click-time. The board's own useWorkflowBoard()
      // picks up these stages normally once it renders.
      for (const stage of DEFAULT_STAGES) {
        await apiClient.post(`/workflow/workflows/${workflow.id}/stages`, stage);
      }
      await queryClient.invalidateQueries({ queryKey: ["workflows"] });
      await queryClient.invalidateQueries({ queryKey: ["workflow-board", workflow.id] });
      toast.success("Workflow created with default stages");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create workflow");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>Set up your editorial workflow</CardTitle>
        <CardDescription>
          Creates a workflow with three starter stages (In Review, SEO Check, Ready to
          Publish) — you can add more later.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Label htmlFor="workflow-name">Workflow name</Label>
        <Input id="workflow-name" value={name} onChange={(e) => setName(e.target.value)} />
        <Button onClick={handleCreate} disabled={submitting || !name.trim()}>
          {submitting ? "Creating…" : "Create Workflow"}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function WorkflowPage() {
  const user = useAuthStore((s) => s.user);
  const { data: workflows, isLoading } = useWorkflows();

  if (isLoading) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  const workflow = workflows?.find((w) => w.isDefault) ?? workflows?.[0];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Editorial Workflow</h1>
        <p className="text-sm text-muted-foreground">
          Drag articles between stages, assign teammates, and leave comments.
        </p>
      </div>

      {!workflow ? (
        hasPermission(user, "workflow:write") ? (
          <FirstRunSetup />
        ) : (
          <p className="text-muted-foreground">No workflow has been set up yet.</p>
        )
      ) : (
        <WorkflowBoard workflowId={workflow.id} />
      )}
    </div>
  );
}
