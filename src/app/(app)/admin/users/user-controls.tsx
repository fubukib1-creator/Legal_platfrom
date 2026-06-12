"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Role } from "@prisma/client";
import { ChevronRight } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { TableRow, TableCell } from "@/components/ui/table";
import {
  createUser,
  setUserActive,
  updateUser,
  getContractsForDepartment,
  reassignContractOwner,
  type ContractForReassign,
} from "@/server/actions/admin";
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
// BU user contracts — expandable cell with reassign
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  REGISTERED: "Registered",
  AWAITING_TEMPLATE: "Awaiting template",
  PENDING_BU_REVISION: "Sent back to BU",
  IN_LEGAL_REVIEW: "Legal review",
  WITH_COUNTERPARTY: "With counterparty",
  CP_RESPONDED: "CP responded",
  AWAITING_SIGNATURE: "Signed",
  OUT_FOR_SIGNING: "Out for signing",
  MONITORING: "Monitoring",
  CANCELLED: "Cancelled",
};

type ContractsView = "list" | "pick" | "confirm";

export function BUUserContractsButton({
  userId,
  userName,
  department,
  contractCount,
}: {
  userId: string;
  userName: string;
  department: string;
  contractCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<ContractsView>("list");
  const [allContracts, setAllContracts] = useState<ContractForReassign[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmContract, setConfirmContract] = useState<ContractForReassign | null>(null);
  const [reassigning, startReassign] = useTransition();

  async function handleOpen() {
    setOpen(true);
    setView("list");
    if (!allContracts) await fetchContracts();
  }

  async function fetchContracts() {
    setLoading(true);
    const result = await getContractsForDepartment(department);
    if (result.success) setAllContracts(result.data);
    else toast.error(result.error);
    setLoading(false);
  }

  function handlePickContract(contract: ContractForReassign) {
    if (contract.currentOwner?.id === userId) return;
    if (contract.currentOwner) {
      setConfirmContract(contract);
      setView("confirm");
    } else {
      doReassign(contract.id);
    }
  }

  function doReassign(contractId: string) {
    startReassign(async () => {
      const r = await reassignContractOwner({ contractId, newOwnerId: userId });
      if (r.success) {
        toast.success("Contract reassigned");
        const result = await getContractsForDepartment(department);
        if (result.success) setAllContracts(result.data);
        setView("list");
        setConfirmContract(null);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  const ownedContracts = allContracts?.filter((c) => c.currentOwner?.id === userId) ?? [];
  const deptContracts = allContracts ?? [];

  return (
    <>
      <button
        type="button"
        className="text-sm font-medium underline-offset-2 hover:underline text-slate-700 cursor-pointer"
        onClick={handleOpen}
      >
        {contractCount}
      </button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setView("list"); setConfirmContract(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {view === "list" && `${userName}'s contracts`}
              {view === "pick" && "Assign a contract"}
              {view === "confirm" && "Confirm reassign"}
            </DialogTitle>
            {view === "list" && (
              <DialogDescription>{department} · {ownedContracts.length} owned</DialogDescription>
            )}
            {view === "pick" && (
              <DialogDescription>
                Select a contract from {department} to assign to {userName}.
              </DialogDescription>
            )}
          </DialogHeader>

          {/* ── List view ── */}
          {view === "list" && (
            <div className="flex flex-col gap-3">
              {loading ? (
                <p className="text-sm text-slate-500">Loading…</p>
              ) : ownedContracts.length === 0 ? (
                <p className="text-sm text-slate-500">No contracts assigned yet.</p>
              ) : (
                <ul className="divide-y rounded-md border text-sm">
                  {ownedContracts.map((c) => (
                    <li key={c.id} className="flex items-center justify-between px-3 py-2">
                      <div>
                        <span className="font-mono text-xs text-slate-500">{c.contractNumber}</span>
                        <p className="font-medium leading-snug">{c.title}</p>
                      </div>
                      <Badge variant="secondary" className="shrink-0 ml-3 text-xs">
                        {STATUS_LABEL[c.status] ?? c.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex justify-between pt-1">
                <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                  Close
                </Button>
                <Button size="sm" onClick={() => setView("pick")}>
                  + Add contract
                </Button>
              </div>
            </div>
          )}

          {/* ── Pick view ── */}
          {view === "pick" && (
            <div className="flex flex-col gap-3">
              {loading ? (
                <p className="text-sm text-slate-500">Loading…</p>
              ) : deptContracts.length === 0 ? (
                <p className="text-sm text-slate-500">No contracts in {department}.</p>
              ) : (
                <ul className="divide-y rounded-md border text-sm max-h-72 overflow-y-auto">
                  {deptContracts.map((c) => {
                    const isOwned = c.currentOwner?.id === userId;
                    return (
                      <li
                        key={c.id}
                        className={`flex items-center justify-between px-3 py-2 ${
                          isOwned ? "opacity-50 cursor-default" : "cursor-pointer hover:bg-slate-50"
                        }`}
                        onClick={() => !isOwned && handlePickContract(c)}
                      >
                        <div>
                          <span className="font-mono text-xs text-slate-500">{c.contractNumber}</span>
                          <p className="font-medium leading-snug">{c.title}</p>
                          {c.currentOwner && !isOwned && (
                            <p className="text-xs text-slate-400">Owned by {c.currentOwner.name}</p>
                          )}
                          {isOwned && (
                            <p className="text-xs text-slate-400">Already assigned to {userName}</p>
                          )}
                        </div>
                        <Badge variant="secondary" className="shrink-0 ml-3 text-xs">
                          {STATUS_LABEL[c.status] ?? c.status}
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="flex justify-between pt-1">
                <Button variant="outline" size="sm" onClick={() => setView("list")}>
                  Back
                </Button>
              </div>
            </div>
          )}

          {/* ── Confirm view ── */}
          {view === "confirm" && confirmContract && (
            <div className="flex flex-col gap-4">
              <p className="text-sm">
                <span className="font-semibold">{confirmContract.contractNumber}</span>{" "}
                {confirmContract.title} is currently assigned to{" "}
                <span className="font-semibold">{confirmContract.currentOwner?.name}</span>.
              </p>
              <p className="text-sm text-slate-600">
                Replace them with <span className="font-semibold">{userName}</span>?
              </p>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => { setView("pick"); setConfirmContract(null); }}
                  disabled={reassigning}
                >
                  Cancel
                </Button>
                <Button onClick={() => doReassign(confirmContract.id)} disabled={reassigning}>
                  {reassigning ? "Reassigning…" : "Confirm"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BU contract panel — inline expandable (replaces dialog)
// ─────────────────────────────────────────────────────────────────────────────

type PanelView = "list" | "pick" | "confirm";

function BUContractPanel({
  userId,
  userName,
  department,
}: {
  userId: string;
  userName: string;
  department: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<PanelView>("list");
  const [allContracts, setAllContracts] = useState<ContractForReassign[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmContract, setConfirmContract] = useState<ContractForReassign | null>(null);
  const [reassigning, startReassign] = useTransition();

  useEffect(() => { void fetchContracts(); }, []);

  async function fetchContracts() {
    setLoading(true);
    const result = await getContractsForDepartment(department);
    if (result.success) setAllContracts(result.data);
    else toast.error(result.error);
    setLoading(false);
  }

  function handlePickContract(contract: ContractForReassign) {
    if (contract.currentOwner?.id === userId) return;
    if (contract.currentOwner) {
      setConfirmContract(contract);
      setView("confirm");
    } else {
      doReassign(contract.id);
    }
  }

  function doReassign(contractId: string) {
    startReassign(async () => {
      const r = await reassignContractOwner({ contractId, newOwnerId: userId });
      if (r.success) {
        toast.success("Contract reassigned");
        const result = await getContractsForDepartment(department);
        if (result.success) setAllContracts(result.data);
        setView("list");
        setConfirmContract(null);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  const ownedContracts = allContracts?.filter((c) => c.currentOwner?.id === userId) ?? [];
  const deptContracts = allContracts ?? [];

  return (
    <div className="px-10 py-4 space-y-3 bg-slate-50 border-t">
      {view === "list" && (
        <>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            {department} · {ownedContracts.length} contract{ownedContracts.length !== 1 ? "s" : ""} owned
          </p>
          {loading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : ownedContracts.length === 0 ? (
            <p className="text-sm text-slate-400">No contracts assigned yet.</p>
          ) : (
            <ul className="divide-y rounded-md border bg-white text-sm">
              {ownedContracts.map((c) => (
                <li key={c.id} className="flex items-center justify-between px-3 py-2">
                  <div>
                    <span className="font-mono text-xs text-slate-400">{c.contractNumber}</span>
                    <p className="font-medium leading-snug">{c.title}</p>
                  </div>
                  <Badge variant="secondary" className="ml-3 shrink-0 text-xs">
                    {STATUS_LABEL[c.status] ?? c.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          <Button size="sm" variant="outline" onClick={() => setView("pick")}>
            + Add contract
          </Button>
        </>
      )}

      {view === "pick" && (
        <>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Select contract from {department} to assign to {userName}
          </p>
          {loading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : deptContracts.length === 0 ? (
            <p className="text-sm text-slate-400">No contracts in {department}.</p>
          ) : (
            <ul className="divide-y rounded-md border bg-white text-sm max-h-56 overflow-y-auto">
              {deptContracts.map((c) => {
                const isOwned = c.currentOwner?.id === userId;
                return (
                  <li
                    key={c.id}
                    className={`flex items-center justify-between px-3 py-2 ${
                      isOwned ? "opacity-40 cursor-default" : "cursor-pointer hover:bg-slate-50"
                    }`}
                    onClick={() => !isOwned && handlePickContract(c)}
                  >
                    <div>
                      <span className="font-mono text-xs text-slate-400">{c.contractNumber}</span>
                      <p className="font-medium leading-snug">{c.title}</p>
                      {c.currentOwner && !isOwned && (
                        <p className="text-xs text-slate-400">Owned by {c.currentOwner.name}</p>
                      )}
                      {isOwned && (
                        <p className="text-xs text-slate-400">Already assigned to {userName}</p>
                      )}
                    </div>
                    <Badge variant="secondary" className="ml-3 shrink-0 text-xs">
                      {STATUS_LABEL[c.status] ?? c.status}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
          <Button size="sm" variant="outline" onClick={() => setView("list")}>
            ← Back
          </Button>
        </>
      )}

      {view === "confirm" && confirmContract && (
        <div className="space-y-3">
          <p className="text-sm">
            <span className="font-semibold">{confirmContract.contractNumber}</span>{" "}
            &quot;{confirmContract.title}&quot; is currently owned by{" "}
            <span className="font-semibold">{confirmContract.currentOwner?.name}</span>.
          </p>
          <p className="text-sm text-slate-500">
            Reassign to <span className="font-semibold">{userName}</span>?
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setView("pick"); setConfirmContract(null); }}
              disabled={reassigning}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => doReassign(confirmContract.id)}
              disabled={reassigning}
            >
              {reassigning ? "Reassigning…" : "Confirm"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// UserTableRow — full row with inline contract expand on name click
// ─────────────────────────────────────────────────────────────────────────────

export function UserTableRow({
  user,
  contractCount,
  isSelf,
}: {
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
    department: string;
    active: boolean;
  };
  contractCount: number;
  isSelf: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isBU = user.role === "BU_MEMBER" || user.role === "BU_MANAGER";

  return (
    <>
      <TableRow className={expanded ? "bg-slate-50/60" : undefined}>
        <TableCell className="font-medium">
          {isBU ? (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="flex items-center gap-1.5 text-left cursor-pointer hover:underline underline-offset-2"
            >
              <ChevronRight
                size={13}
                className={`flex-shrink-0 text-slate-400 transition-transform duration-150 ${
                  expanded ? "rotate-90" : ""
                }`}
              />
              {user.name}
            </button>
          ) : (
            user.name
          )}
        </TableCell>
        <TableCell className="text-sm text-slate-600">{user.email}</TableCell>
        <TableCell className="font-mono text-xs">{user.role}</TableCell>
        <TableCell>{user.department}</TableCell>
        <TableCell>
          {user.active ? (
            <Badge variant="secondary" className="border-0 bg-green-100 text-green-900">
              Active
            </Badge>
          ) : (
            <Badge variant="secondary" className="border-0 bg-slate-200 text-slate-700">
              Inactive
            </Badge>
          )}
        </TableCell>
        <TableCell className="text-sm text-slate-500">
          {isBU ? contractCount : "—"}
        </TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end gap-2">
            <UserEditButton
              user={{
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                department: user.department,
              }}
              isSelf={isSelf}
            />
            <UserActiveToggle userId={user.id} active={user.active} isSelf={isSelf} />
          </div>
        </TableCell>
      </TableRow>
      {expanded && isBU && (
        <TableRow>
          <TableCell colSpan={7} className="p-0">
            <BUContractPanel
              userId={user.id}
              userName={user.name}
              department={user.department}
            />
          </TableCell>
        </TableRow>
      )}
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
