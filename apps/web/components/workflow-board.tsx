"use client";

import { useState } from "react";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, useDraggable, useDroppable } from "@dnd-kit/core";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAddStage, useAssignArticle, useWorkflowBoard } from "@/hooks/use-workflow";
import { useAuthStore, hasPermission } from "@/lib/auth-store";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { WorkflowBoardCard } from "@/lib/types";
import { WorkflowCommentsDialog } from "./workflow-comments-dialog";

function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function ArticleCard({ card, onOpenComments }: { card: WorkflowBoardCard; onOpenComments: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    data: card,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={
        transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
          : undefined
      }
      className={cn(
        "flex cursor-grab flex-col gap-2 rounded-md border bg-background p-3 text-sm shadow-sm active:cursor-grabbing",
        isDragging && "z-10 opacity-50",
      )}
    >
      <p className="font-medium leading-snug">{card.title}</p>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          {card.assignedUser ? (
            <span
              className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary"
              title={card.assignedUser.displayName ?? undefined}
            >
              {initials(card.assignedUser.displayName)}
            </span>
          ) : (
            <span className="text-muted-foreground/70">Unassigned</span>
          )}
        </span>
        <button
          type="button"
          // dnd-kit's drag-activation listener is spread onto this card's
          // root div (an ancestor), so it sees pointerdown before React's
          // synthetic click ever fires — stopping propagation only on
          // onClick is too late. Stopping it at pointerDown here keeps the
          // ancestor's listener from treating this as a drag start at all.
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onOpenComments();
          }}
          className="hover:underline"
        >
          Comments
        </button>
      </div>
    </div>
  );
}

function Column({
  id,
  title,
  color,
  cards,
  onOpenComments,
}: {
  id: string;
  title: string;
  color?: string | null;
  cards: WorkflowBoardCard[];
  onOpenComments: (card: WorkflowBoardCard) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div className="flex w-72 shrink-0 flex-col gap-3">
      <div className="flex items-center gap-2 px-1">
        {color && (
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
        )}
        <h3 className="text-sm font-semibold">{title}</h3>
        <Badge variant="outline">{cards.length}</Badge>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-24 flex-col gap-2 rounded-lg border-2 border-dashed p-2 transition-colors",
          isOver ? "border-primary bg-primary/5" : "border-transparent bg-muted/30",
        )}
      >
        {cards.map((card) => (
          <ArticleCard key={card.id} card={card} onOpenComments={() => onOpenComments(card)} />
        ))}
        {cards.length === 0 && (
          <p className="p-2 text-center text-xs text-muted-foreground">Drop articles here</p>
        )}
      </div>
    </div>
  );
}

export function WorkflowBoard({ workflowId }: { workflowId: string }) {
  const user = useAuthStore((s) => s.user);
  const canWrite = hasPermission(user, "workflow:write");
  const { data: board, isLoading } = useWorkflowBoard(workflowId);
  const assignArticle = useAssignArticle(workflowId);
  const addStage = useAddStage(workflowId);

  const [activeCard, setActiveCard] = useState<WorkflowBoardCard | null>(null);
  const [commentsCard, setCommentsCard] = useState<WorkflowBoardCard | null>(null);
  const [addStageOpen, setAddStageOpen] = useState(false);
  const [newStageName, setNewStageName] = useState("");

  if (isLoading || !board) {
    return <p className="text-muted-foreground">Loading board…</p>;
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCard((event.active.data.current as WorkflowBoardCard) ?? null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const card = (event.active.data.current as WorkflowBoardCard) ?? null;
    setActiveCard(null);
    if (!card || !event.over) return;

    const targetStageId = event.over.id as string;
    if (targetStageId === card.workflowStageId) return;
    if (!canWrite) {
      toast.error("You don't have permission to move articles");
      return;
    }
    if (targetStageId === "unassigned") {
      // The backend has no "remove from workflow" operation yet — assigning
      // always requires a real stage. Unassigned is a source column only.
      toast.error("Articles can't be moved back to Unassigned yet");
      return;
    }

    try {
      await assignArticle.mutateAsync({
        articleId: card.id,
        stageId: targetStageId,
        assigneeId: card.assignedUser?.id ?? user!.id,
      });
      toast.success("Article moved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to move article");
    }
  };

  const handleAddStage = async () => {
    if (!newStageName.trim()) return;
    try {
      await addStage.mutateAsync({ name: newStageName.trim() });
      setNewStageName("");
      setAddStageOpen(false);
      toast.success("Stage added");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to add stage");
    }
  };

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        <Column
          id="unassigned"
          title="Unassigned"
          cards={board.unassigned}
          onOpenComments={setCommentsCard}
        />
        {board.stages.map((stage) => (
          <Column
            key={stage.id}
            id={stage.id}
            title={stage.name}
            color={stage.color}
            cards={stage.articles}
            onOpenComments={setCommentsCard}
          />
        ))}
        {canWrite && (
          <div className="w-72 shrink-0">
            <Button variant="outline" className="w-full" onClick={() => setAddStageOpen(true)}>
              + Add Stage
            </Button>
          </div>
        )}
      </div>

      <DragOverlay>
        {activeCard && (
          <div className="w-72 rounded-md border bg-background p-3 text-sm shadow-lg">
            {activeCard.title}
          </div>
        )}
      </DragOverlay>

      <Dialog open={addStageOpen} onOpenChange={setAddStageOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a workflow stage</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="e.g. SEO Check"
            value={newStageName}
            onChange={(e) => setNewStageName(e.target.value)}
          />
          <DialogFooter>
            <Button onClick={handleAddStage} disabled={addStage.isPending}>
              Add Stage
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {commentsCard && (
        <WorkflowCommentsDialog
          articleId={commentsCard.id}
          articleTitle={commentsCard.title}
          open={!!commentsCard}
          onOpenChange={(open) => !open && setCommentsCard(null)}
        />
      )}
    </DndContext>
  );
}
