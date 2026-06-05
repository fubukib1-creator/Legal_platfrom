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
import { Textarea } from "@/components/ui/textarea";
import { extendSLA } from "@/server/actions/contracts";

type Props = {
  contractId: string;
};

export function SLAExtensionButton({ contractId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const days = Number(fd.get("days"));
    const reason = ((fd.get("reason") as string) || "").trim() || null;

    if (!Number.isFinite(days) || days <= 0) {
      toast.error("Enter a positive number of business days");
      return;
    }

    startTransition(async () => {
      const result = await extendSLA({ contractId, days, reason });
      if (result.success) {
        toast.success(
          `SLA extended by ${days} business day${days === 1 ? "" : "s"}`,
        );
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
        onClick={() => setOpen(true)}
        disabled={pending}
      >
        Extend SLA
      </Button>
      <Dialog open={open} onOpenChange={(v) => (pending ? null : setOpen(v))}>
        <DialogContent>
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>Extend SLA deadline</DialogTitle>
              <DialogDescription>
                Push the current review&apos;s deadline by the chosen number of
                business days. The extension stacks on top of any previous one.
              </DialogDescription>
            </DialogHeader>

            <div className="my-4 flex flex-col gap-4">
              <div className="grid gap-2">
                <Label htmlFor="days">Business days to add</Label>
                <Input
                  id="days"
                  name="days"
                  type="number"
                  min={1}
                  max={60}
                  defaultValue={3}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="reason">Reason (optional)</Label>
                <Textarea id="reason" name="reason" rows={3} maxLength={500} />
              </div>
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
              <Button type="submit" disabled={pending}>
                {pending ? "Extending…" : "Extend SLA"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
