"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Role } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createUser, setUserActive, updateUser } from "@/server/actions/admin";
import { ALL_DEPARTMENTS } from "@/lib/departments";

const ROLES: ReadonlyArray<readonly [Role, string]> = [
  ["BU_MEMBER", "BU member"],
  ["BU_MANAGER", "BU manager"],
  ["LEGAL_REVIEWER", "Legal reviewer"],
  ["LEGAL_LEAD", "Legal lead"],
  ["ADMIN", "Admin"],
];

function roleLabel(role: Role): string {
  return ROLES.find(([r]) => r === role)?.[1] ?? role;
}

// ─────────────────────────────────────────────────────────────────────────────
// Create form
// ─────────────────────────────────────────────────────────────────────────────

export function UserCreateForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [role, setRole] = useState<Role>("BU_MEMBER");
  const [department, setDepartment] = useState<string>(ALL_DEPARTMENTS[0]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await createUser({
        email: (fd.get("email") as string) ?? "",
        name: (fd.get("name") as string) ?? "",
        role,
        department,
        password: (fd.get("password") as string) ?? "",
      });
      if (r.success) {
        toast.success("User created");
        (e.target as HTMLFormElement).reset();
        setRole("BU_MEMBER");
        setDepartment(ALL_DEPARTMENTS[0]);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="grid gap-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="role">Role</Label>
        <Select value={role} onValueChange={(v) => v && setRole(v as Role)}>
          <SelectTrigger id="role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="department">Department</Label>
        <Select value={department} onValueChange={(v) => v && setDepartment(v)}>
          <SelectTrigger id="department">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ALL_DEPARTMENTS.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="password">Initial password (min 8 chars)</Label>
        <Input id="password" name="password" type="password" required minLength={8} />
      </div>
      <div className="sm:col-span-2 flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create user"}
        </Button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Edit dialog
// ─────────────────────────────────────────────────────────────────────────────

type EditableUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  department: string;
};

export function UserEditButton({
  user,
  isSelf,
}: {
  user: EditableUser;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<Role>(user.role);
  const [department, setDepartment] = useState<string>(user.department);
  const [newPassword, setNewPassword] = useState("");

  // If the user is opened then edited then the dialog re-opens with stale
  // values, reset on open.
  function handleOpen(v: boolean) {
    if (pending) return;
    setOpen(v);
    if (v) {
      setName(user.name);
      setRole(user.role);
      setDepartment(user.department);
      setNewPassword("");
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const r = await updateUser({
        userId: user.id,
        name,
        role,
        department,
        newPassword: newPassword.length > 0 ? newPassword : undefined,
      });
      if (r.success) {
        toast.success("User updated");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => handleOpen(true)}>
        Edit
      </Button>
      <Dialog open={open} onOpenChange={handleOpen}>
        <DialogContent>
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>Edit user</DialogTitle>
              <DialogDescription>
                {user.email}
                {isSelf ? " (you — role change disabled)" : null}
              </DialogDescription>
            </DialogHeader>

            <div className="my-4 grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-name">Name</Label>
                <Input
                  id="edit-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={120}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit-role">Role</Label>
                <Select
                  value={role}
                  onValueChange={(v) => v && setRole(v as Role)}
                  disabled={isSelf}
                >
                  <SelectTrigger id="edit-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isSelf ? (
                  <p className="text-xs text-slate-500">
                    Currently {roleLabel(user.role)}. Self-demotion is blocked to avoid lockout.
                  </p>
                ) : null}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit-department">Department</Label>
                <Select value={department} onValueChange={(v) => v && setDepartment(v)}>
                  <SelectTrigger id="edit-department">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_DEPARTMENTS.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit-password">Reset password (optional)</Label>
                <Input
                  id="edit-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Leave blank to keep the current password"
                  minLength={newPassword.length > 0 ? 8 : undefined}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Activate / deactivate (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

export function UserActiveToggle({
  userId,
  active,
  isSelf,
}: {
  userId: string;
  active: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const r = await setUserActive({ userId, active: !active });
      if (r.success) {
        toast.success(active ? "Deactivated" : "Reactivated");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  if (isSelf) {
    return <span className="text-xs text-slate-400">(you)</span>;
  }
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={toggle}
      disabled={pending}
    >
      {active ? "Deactivate" : "Reactivate"}
    </Button>
  );
}
