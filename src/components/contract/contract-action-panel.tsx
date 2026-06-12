"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  cancelContract,
  markAwaitingSignature,
  pickupReview,
  resubmitForReview,
  reviseDraft,
  startReview,
  submitForSigning,
  type ActionResult,
} from "@/server/actions/contracts";
import type { AvailableAction } from "@/lib/contract-actions-registry";

type Props = {
  contractId: string;
  actions: AvailableAction[];
  children?: React.ReactNode;
};

const NOTES_LABEL: Record<string, string> = {
  templateName: "Template description (optional)",
  submitNotes: "Notes for legal (optional)",
  legalNotes: "Comments for the BU (optional)",
};

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function ContractActionPanel({ contractId, actions, children }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState<AvailableAction | null>(null);
  const [pending, startTransition] = useTransition();

  if (actions.length === 0) {
    if (children) {
      return <div className="flex flex-wrap gap-2">{children}</div>;
    }
    return (
      <p className="text-sm text-slate-500">
        No actions available at this stage.
      </p>
    );
  }

  function close() {
    if (!pending) setOpen(null);
  }

  function runAction(a: AvailableAction, formData: FormData) {
    startTransition(async () => {
      let result: ActionResult;
      const input = { contractId, formData };
      switch (a.action) {
        case "startReview":
          result = await startReview(input);
          break;
        case "resubmitForReview":
          result = await resubmitForReview(input);
          break;
        case "pickupReview":
          result = await pickupReview({ contractId });
          break;
        case "revise":
          result = await reviseDraft(input);
          break;
        case "markAwaitingSignature":
          result = await markAwaitingSignature(input);
          break;
        case "submitForSigning":
          result = await submitForSigning(input);
          break;
        case "cancelContract":
          result = await cancelContract({
            contractId,
            reason: (formData.get("cancelReason") as string) ?? "",
          });
          break;
        case "registerContract":
        case "updateTracking":
          result = { success: false, error: "Not invoked from action panel" };
          break;
      }

      if (result.success) {
        toast.success(`Done: ${a.label.toLowerCase()}`);
        setOpen(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a) => {
        const variant: "default" | "destructive" | "outline" =
          a.action === "cancelContract"
            ? "destructive"
            : a.action === "revise"
              ? "outline"
              : "default";
        return (
          <Button
            key={a.action}
            variant={variant}
            disabled={pending}
            onClick={() => setOpen(a)}
          >
            {a.label}
          </Button>
        );
      })}
      {children}

      <Dialog open={open !== null} onOpenChange={(v) => (v ? null : close())}>
        <DialogContent>
          {open ? (
            // Remount the form when a new action opens so internal form state
            // (date pickers, selects) resets to its initial value — cleaner
            // than calling setState in an effect.
            <ActionForm
              key={open.action}
              action={open}
              pending={pending}
              onCancel={close}
              onSubmit={(fd) => runAction(open, fd)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ActionForm({
  action,
  pending,
  onCancel,
  onSubmit,
}: {
  action: AvailableAction;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (fd: FormData) => void;
}) {
  const showStageDate =
    action.action !== "cancelContract" && action.action !== "pickupReview";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(new FormData(e.currentTarget));
      }}
    >
      <DialogHeader>
        <DialogTitle>{action.label}</DialogTitle>
        <DialogDescription>
          {action.action === "cancelContract"
            ? "Cancellation is permanent. The contract will move to CANCELLED."
            : "Pick the date the stage actually moved and (optionally) add notes."}
        </DialogDescription>
      </DialogHeader>

      <div className="my-4 flex flex-col gap-4">
        {showStageDate ? (
          <div className="grid gap-2">
            <Label htmlFor="stageDate">Stage date</Label>
            <Input
              id="stageDate"
              name="stageDate"
              type="date"
              defaultValue={todayIsoDate()}
              required
            />
            <p className="text-xs text-muted-foreground">
              Backdate this if the stage actually moved on an earlier day — the
              timeline and SLA math will use this date.
            </p>
          </div>
        ) : null}

        {action.notesField ? (
          <div className="grid gap-2">
            <Label htmlFor={action.notesField}>
              {NOTES_LABEL[action.notesField] ?? "Notes"}
            </Label>
            <Textarea id={action.notesField} name={action.notesField} rows={3} />
          </div>
        ) : null}

        {action.action === "cancelContract" ? (
          <div className="grid gap-2">
            <Label htmlFor="cancelReason">Reason</Label>
            <Textarea id="cancelReason" name="cancelReason" required rows={3} />
          </div>
        ) : null}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant={action.action === "cancelContract" ? "destructive" : "default"}
          disabled={pending}
        >
          {pending ? "Working…" : action.label}
        </Button>
      </DialogFooter>
    </form>
  );
}
