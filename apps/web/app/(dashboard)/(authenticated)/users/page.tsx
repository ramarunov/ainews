"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { MoreHorizontal, Plus } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useAssignRole,
  useCreateOrgMember,
  useDeactivateOrgMember,
  useDeleteOrgMember,
  useOrgMembers,
  useOrgRoles,
  useReactivateOrgMember,
  useRevokeRole,
} from "@/hooks/use-org-users";
import { ApiError } from "@/lib/api-client";
import { hasPermission, useAuthStore } from "@/lib/auth-store";
import type { OrgMember } from "@/lib/types";

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  const bytes = new Uint32Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

const addUserSchema = z.object({
  firstName: z.string().min(1, "Required").max(100),
  lastName: z.string().min(1, "Required").max(100),
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(12, "At least 12 characters"),
});

type AddUserFormValues = z.infer<typeof addUserSchema>;

function AddUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: roles } = useOrgRoles();
  const createMember = useCreateOrgMember();
  const [roleIds, setRoleIds] = useState<Set<string>>(new Set());
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<AddUserFormValues>({
    resolver: zodResolver(addUserSchema),
    defaultValues: { firstName: "", lastName: "", email: "", password: "" },
  });

  const resetAll = () => {
    reset({ firstName: "", lastName: "", email: "", password: "" });
    setRoleIds(new Set());
  };

  const toggleRole = (roleId: string, checked: boolean) => {
    setRoleIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(roleId);
      else next.delete(roleId);
      return next;
    });
  };

  const onSubmit = async (values: AddUserFormValues) => {
    try {
      await createMember.mutateAsync({ ...values, roleIds: [...roleIds] });
      toast.success("User created — their temporary password was also emailed to them");
      onOpenChange(false);
      resetAll();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create user");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) resetAll();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a user</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-user-first">First name</Label>
              <Input id="new-user-first" {...register("firstName")} />
              {errors.firstName && <p className="text-sm text-destructive">{errors.firstName.message}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-user-last">Last name</Label>
              <Input id="new-user-last" {...register("lastName")} />
              {errors.lastName && <p className="text-sm text-destructive">{errors.lastName.message}</p>}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-user-email">Email</Label>
            <Input id="new-user-email" type="email" {...register("email")} />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-user-password">
              Temporary password{" "}
              <span className="font-normal text-muted-foreground">
                (also emailed to the new user)
              </span>
            </Label>
            <div className="flex gap-2">
              <Input id="new-user-password" {...register("password")} />
              <Button
                type="button"
                variant="outline"
                onClick={() => setValue("password", generatePassword(), { shouldValidate: true })}
              >
                Generate
              </Button>
            </div>
            {watch("password") && (
              <p className="text-xs text-muted-foreground">
                Share this with the user, or they&apos;ll receive it by email.
              </p>
            )}
            {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label>Roles</Label>
            <div className="flex flex-col gap-2">
              {(roles ?? []).map((role) => (
                <div key={role.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`new-user-role-${role.id}`}
                    checked={roleIds.has(role.id)}
                    onCheckedChange={(checked) => toggleRole(role.id, checked === true)}
                  />
                  <Label htmlFor={`new-user-role-${role.id}`} className="flex-1 font-normal">
                    {role.name}
                  </Label>
                </div>
              ))}
              {(roles ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">No roles configured.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createMember.isPending}>
              {createMember.isPending ? "Creating…" : "Create User"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ManageRolesDialog({
  member,
  open,
  onOpenChange,
}: {
  member: OrgMember | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: roles } = useOrgRoles();
  const assignRole = useAssignRole();
  const revokeRole = useRevokeRole();

  if (!member) return null;

  const currentRoleIds = new Set(member.userRoles.map((ur) => ur.role.id));

  const handleToggle = async (roleId: string, checked: boolean) => {
    try {
      if (checked) {
        await assignRole.mutateAsync({ userId: member.id, roleId });
      } else {
        await revokeRole.mutateAsync({ userId: member.id, roleId });
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update role");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Roles for {member.displayName ?? member.email}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {(roles ?? []).map((role) => (
            <div key={role.id} className="flex items-center gap-2">
              <Checkbox
                id={`role-${role.id}`}
                checked={currentRoleIds.has(role.id)}
                onCheckedChange={(checked) => handleToggle(role.id, checked === true)}
              />
              <Label htmlFor={`role-${role.id}`} className="flex-1">
                {role.name}
                {role.description && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {role.description}
                  </span>
                )}
              </Label>
            </div>
          ))}
          {(roles ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No roles configured.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function UsersPage() {
  const authUser = useAuthStore((s) => s.user);
  const canWrite = hasPermission(authUser, "users:write");
  const canDelete = hasPermission(authUser, "users:delete");

  const [search, setSearch] = useState("");
  const { data, isLoading } = useOrgMembers({ search: search || undefined, limit: 50 });
  const deactivate = useDeactivateOrgMember();
  const reactivate = useReactivateOrgMember();
  const deleteMember = useDeleteOrgMember();
  const [rolesDialogMember, setRolesDialogMember] = useState<OrgMember | null>(null);
  const [addUserOpen, setAddUserOpen] = useState(false);

  const handleDeactivate = async (id: string) => {
    try {
      await deactivate.mutateAsync(id);
      toast.success("User deactivated");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to deactivate user");
    }
  };

  const handleReactivate = async (id: string) => {
    try {
      await reactivate.mutateAsync(id);
      toast.success("User reactivated");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to reactivate user");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMember.mutateAsync(id);
      toast.success("User removed");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to remove user");
    }
  };

  const members = data?.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="text-sm text-muted-foreground">
            Manage your organization&apos;s members and their roles.
          </p>
        </div>
        {authUser?.isSuperadmin && (
          <Button onClick={() => setAddUserOpen(true)}>
            <Plus className="h-4 w-4" />
            Add User
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All members</CardTitle>
          <Input
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
        </CardHeader>
        <CardContent>
          {isLoading && (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          )}
          {!isLoading && members.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">No members found.</p>
          )}
          {members.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last login</TableHead>
                  {(canWrite || canDelete) && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">
                      {member.displayName ?? (`${member.firstName ?? ""} ${member.lastName ?? ""}`.trim() || "—")}
                      {member.isSuperadmin && (
                        <Badge variant="secondary" className="ml-2">
                          Superadmin
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{member.email}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {member.userRoles.map((ur) => (
                          <Badge key={ur.role.id} variant="outline">
                            {ur.role.name}
                          </Badge>
                        ))}
                        {member.userRoles.length === 0 && (
                          <span className="text-xs text-muted-foreground">No role</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={member.isActive ? "default" : "outline"}>
                        {member.isActive ? "Active" : "Deactivated"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {member.lastLoginAt
                        ? new Date(member.lastLoginAt).toLocaleString()
                        : "Never"}
                    </TableCell>
                    {(canWrite || canDelete) && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            className={buttonVariants({ variant: "ghost", size: "icon" })}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canWrite && (
                              <DropdownMenuItem onClick={() => setRolesDialogMember(member)}>
                                Manage Roles
                              </DropdownMenuItem>
                            )}
                            {canWrite && member.isActive && (
                              <DropdownMenuItem onClick={() => handleDeactivate(member.id)}>
                                Deactivate
                              </DropdownMenuItem>
                            )}
                            {canWrite && !member.isActive && (
                              <DropdownMenuItem onClick={() => handleReactivate(member.id)}>
                                Reactivate
                              </DropdownMenuItem>
                            )}
                            {canDelete && (
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => handleDelete(member.id)}
                              >
                                Remove
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ManageRolesDialog
        member={rolesDialogMember}
        open={!!rolesDialogMember}
        onOpenChange={(open) => !open && setRolesDialogMember(null)}
      />
      <AddUserDialog open={addUserOpen} onOpenChange={setAddUserOpen} />
    </div>
  );
}
