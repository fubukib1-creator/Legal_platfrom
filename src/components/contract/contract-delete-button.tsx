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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteContract } from "@/server/actions/contracts";

type Props = {
  contractId: string;
  contractNumber: string;
};

export function ContractDeleteButton({ contractId, contractNumber }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (confirm !== contractNumber) {
      toast.error("Type the contract number to confirm");
      return;
    }
    startTransition(async () => {
      const result = await deleteContract({ contractId });
      if (result.success) {
        toast.success("Contract deleted");
        router.push("/contracts");
        router.refresh();
      } else {
        toast.error(result.error);
        setOpen(false);
      }
    });
  }

  return (
    <>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={pending}
      >
        Delete
      </Button>
      <Dialog open={open} onOpenChange={(v) => (pending ? null : setOpen(v))}>
        <DialogContent>
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>Delete contract</DialogTitle>
              <DialogDescription>
                This permanently removes the contract, its reviews, versions,
                and timeline. Type{" "}
                <code className="rounded bg-muted px-1 font-mono text-foreground">
                  {contractNumber}
                </code>{" "}
                to confirm.
              </DialogDescription>
            </DialogHeader>

            <div className="my-4 grid gap-2">
              <Label htmlFor="confirm">Contract number</Label>
              <Input
                id="confirm"
                value={confirm}
                onChange={(e) => setConfirm(e.currentTarget.value)}
                autoFocus
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={pending || confirm !== contractNumber}
              >
                {pending ? "Deleting…" : "Delete permanently"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
