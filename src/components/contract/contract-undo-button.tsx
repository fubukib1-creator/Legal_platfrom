"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { undoLastStage } from "@/server/actions/contracts";

type Props = {
  contractId: string;
};

export function ContractUndoButton({ contractId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function runUndo() {
    startTransition(async () => {
      const result = await undoLastStage({ contractId });
      if (result.success) {
        toast.success(`Reverted to ${result.data.revertedTo}`);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={pending}
      >
        Undo
      </Button>
      <Dialog open={open} onOpenChange={(v) => (pending ? null : setOpen(v))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Undo last stage</DialogTitle>
            <DialogDescription>
              Reverts the most recent status transition. The undo itself is
              recorded on the timeline so the audit trail stays intact.
              Side-effects from the reverted step (uploaded files, written
              dates) are reset where possible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button onClick={runUndo} disabled={pending}>
              {pending ? "Undoing…" : "Undo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
