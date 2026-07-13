import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type {
  EditorialComment,
  OrgUser,
  PaginatedResponse,
  Workflow,
  WorkflowBoard,
  WorkflowStage,
} from "@/lib/types";

// Writers/SEO managers have workflow:read but not users:read, so this
// query 403s for them — the caller checks `isError` to hide the assignee
// picker gracefully instead of treating it as a real failure.
export function useOrgUsers() {
  return useQuery({
    queryKey: ["org-users-for-workflow"],
    queryFn: () => apiClient.get<PaginatedResponse<OrgUser>>("/users?limit=100"),
    staleTime: 60_000,
    retry: false,
  });
}

export function useWorkflows() {
  return useQuery({
    queryKey: ["workflows"],
    queryFn: () => apiClient.get<Workflow[]>("/workflow/workflows"),
    staleTime: 60_000,
  });
}

export function useCreateWorkflow() {
  // Deliberately no onSuccess invalidation here: the only caller
  // (the first-run setup flow) still needs to create the workflow's
  // starter stages before the board should mount and fetch — invalidating
  // "workflows" immediately would mount <WorkflowBoard> mid-way through
  // that stage-creation loop, so the board's first fetch would catch only
  // whichever stages happened to exist at that instant. The caller
  // invalidates once everything is actually done.
  return useMutation({
    mutationFn: (input: { name: string; description?: string; isDefault?: boolean }) =>
      apiClient.post<Workflow>("/workflow/workflows", input),
  });
}

export function useWorkflowBoard(workflowId: string | undefined) {
  return useQuery({
    queryKey: ["workflow-board", workflowId],
    queryFn: () => apiClient.get<WorkflowBoard>(`/workflow/workflows/${workflowId}/board`),
    enabled: !!workflowId,
    refetchInterval: 15_000,
  });
}

export function useAddStage(workflowId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; color?: string }) =>
      apiClient.post<WorkflowStage>(`/workflow/workflows/${workflowId}/stages`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflow-board", workflowId] });
    },
  });
}

export function useAssignArticle(workflowId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      articleId,
      ...input
    }: {
      articleId: string;
      stageId: string;
      assigneeId: string;
      dueDate?: string;
      note?: string;
    }) => apiClient.post(`/workflow/articles/${articleId}/assign`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflow-board", workflowId] });
    },
  });
}

export function useComments(articleId: string | undefined) {
  return useQuery({
    queryKey: ["workflow-comments", articleId],
    queryFn: () => apiClient.get<EditorialComment[]>(`/workflow/articles/${articleId}/comments`),
    enabled: !!articleId,
  });
}

export function useAddComment(articleId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { content: string; parentId?: string }) =>
      apiClient.post(`/workflow/articles/${articleId}/comments`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflow-comments", articleId] });
    },
  });
}

export function useResolveComment(articleId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) =>
      apiClient.patch(`/workflow/comments/${commentId}/resolve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflow-comments", articleId] });
    },
  });
}
