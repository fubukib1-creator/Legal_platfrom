"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { PaymentSide } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { updateTracking } from "@/server/actions/contracts";

export type TrackingFields = {
  paymentSide: PaymentSide | null;
  effectiveDate: Date | null;
  expiryDate: Date | null;
  renewalDecisionDeadline: Date | null;
  contractValue: string | null;
  revenueStamp: string | null;
  depositAmount: string | null;
  depositReturnDate: Date | null;
  monitoringNotes: string | null;
};

const PAYMENT_SIDE_LABEL: Record<PaymentSide, string> = {
  PAYER: "Payer (we pay)",
  RECEIVER: "Receiver (we receive)",
};

type Props = {
  contractId: string;
  currency: string;
  canEdit: boolean;
  tracking: TrackingFields;
};

const DATE_TZ = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "Asia/Bangkok",
});

function fmtDate(d: Date | null): string {
  return d ? DATE_TZ.format(d) : "—";
}

function dateInputValue(d: Date | null | undefined): string {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function LifecycleTrackingCard({
  contractId,
  currency,
  canEdit,
  tracking,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [paymentSide, setPaymentSide] = useState<PaymentSide | "">(
    tracking.paymentSide ?? "",
  );

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateTracking({
        contractId,
        paymentSide: paymentSide === "" ? null : paymentSide,
        effectiveDate: (fd.get("effectiveDate") as string | null) ?? null,
        expiryDate: (fd.get("expiryDate") as string | null) ?? null,
        renewalDecisionDeadline:
          (fd.get("renewalDecisionDeadline") as string | null) ?? null,
        contractValue: (fd.get("contractValue") as string | null) ?? null,
        revenueStamp: (fd.get("revenueStamp") as string | null) ?? null,
        depositAmount: (fd.get("depositAmount") as string | null) ?? null,
        depositReturnDate:
          (fd.get("depositReturnDate") as string | null) ?? null,
        monitoringNotes: (fd.get("monitoringNotes") as string | null) ?? null,
      });
      if (result.success) {
        toast.success("Tracking updated");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Lifecycle tracking</CardTitle>
        {canEdit ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen(true)}
            disabled={pending}
          >
            Edit
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
        <Field
          label="Payment side"
          value={
            tracking.paymentSide
              ? PAYMENT_SIDE_LABEL[tracking.paymentSide]
              : "—"
          }
        />
        <Field label="Effective date" value={fmtDate(tracking.effectiveDate)} />
        <Field label="Contract expiry" value={fmtDate(tracking.expiryDate)} />
        <Field
          label="Renewal decision deadline"
          value={fmtDate(tracking.renewalDecisionDeadline)}
        />
        <Field
          label="Contract value"
          value={
            tracking.contractValue ? `${tracking.contractValue} ${currency}` : "—"
          }
        />
        <Field
          label="Revenue stamp"
          value={
            tracking.revenueStamp ? `${tracking.revenueStamp} ${currency}` : "—"
          }
        />
        <Field
          label="Security deposit"
          value={
            tracking.depositAmount
              ? `${tracking.depositAmount} ${currency}`
              : "—"
          }
        />
        <Field
          label="Deposit refund"
          value={fmtDate(tracking.depositReturnDate)}
        />
        {tracking.monitoringNotes ? (
          <div className="col-span-2 md:col-span-4">
            <div className="text-xs text-slate-500">Notes</div>
            <div>{tracking.monitoringNotes}</div>
          </div>
        ) : null}
      </CardContent>

      {canEdit ? (
        <Dialog
          open={open}
          onOpenChange={(v) => (pending ? null : setOpen(v))}
        >
          <DialogContent>
            <form onSubmit={onSubmit}>
              <DialogHeader>
                <DialogTitle>Edit lifecycle tracking</DialogTitle>
                <DialogDescription>
                  Correct values that were auto-extracted from the signed
                  contract, or fill in any that are missing.
                </DialogDescription>
              </DialogHeader>

              <div className="my-4 flex flex-col gap-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="grid gap-2 sm:col-span-2">
                    <Label htmlFor="paymentSide">Payment side</Label>
                    <Select
                      value={paymentSide}
                      onValueChange={(v) =>
                        setPaymentSide((v as PaymentSide | "") ?? "")
                      }
                    >
                      <SelectTrigger id="paymentSide">
                        <SelectValue placeholder="Select payment side" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PAYER">{PAYMENT_SIDE_LABEL.PAYER}</SelectItem>
                        <SelectItem value="RECEIVER">{PAYMENT_SIDE_LABEL.RECEIVER}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="effectiveDate">Effective date</Label>
                    <Input
                      id="effectiveDate"
                      name="effectiveDate"
                      type="date"
                      defaultValue={dateInputValue(tracking.effectiveDate)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="expiryDate">Contract expiry date</Label>
                    <Input
                      id="expiryDate"
                      name="expiryDate"
                      type="date"
                      defaultValue={dateInputValue(tracking.expiryDate)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="renewalDecisionDeadline">
                      Renewal decision deadline
                    </Label>
                    <Input
                      id="renewalDecisionDeadline"
                      name="renewalDecisionDeadline"
                      type="date"
                      defaultValue={dateInputValue(
                        tracking.renewalDecisionDeadline,
                      )}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="contractValue">
                      Contract value ({currency})
                    </Label>
                    <Input
                      id="contractValue"
                      name="contractValue"
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      defaultValue={tracking.contractValue ?? ""}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="revenueStamp">
                      Revenue stamp ({currency})
                    </Label>
                    <Input
                      id="revenueStamp"
                      name="revenueStamp"
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      defaultValue={tracking.revenueStamp ?? ""}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="depositAmount">
                      Security deposit ({currency})
                    </Label>
                    <Input
                      id="depositAmount"
                      name="depositAmount"
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      defaultValue={tracking.depositAmount ?? ""}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="depositReturnDate">Deposit refund date</Label>
                    <Input
                      id="depositReturnDate"
                      name="depositReturnDate"
                      type="date"
                      defaultValue={dateInputValue(tracking.depositReturnDate)}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="monitoringNotes">Notes (optional)</Label>
                  <Textarea
                    id="monitoringNotes"
                    name="monitoringNotes"
                    rows={3}
                    defaultValue={tracking.monitoringNotes ?? ""}
                  />
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
                  {pending ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-medium tabular-nums">{value}</div>
    </div>
  );
}
