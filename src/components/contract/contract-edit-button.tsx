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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { editContract } from "@/server/actions/contracts";
import { CONTRACT_TYPES } from "@/lib/contract-types";
import { BU_DEPARTMENTS } from "@/lib/departments";

type Complexity = "LOW" | "MEDIUM" | "HIGH" | "";

type Props = {
  contractId: string;
  initial: {
    title: string;
    type: string;
    complexity: string | null;
    counterparty: string;
    estimatedValue: string | null;
    currency: string;
    buDepartment: string;
    notes: string | null;
  };
};

export function ContractEditButton({ contractId, initial }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState(initial.type);
  const [complexity, setComplexity] = useState<Complexity>(
    (initial.complexity as Complexity) ?? "",
  );
  const [department, setDepartment] = useState(initial.buDepartment);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await editContract({
        contractId,
        title: (fd.get("title") as string)?.trim() || initial.title,
        type: type as Parameters<typeof editContract>[0]["type"],
        complexity: complexity === "" ? null : complexity,
        counterparty:
          (fd.get("counterparty") as string)?.trim() || initial.counterparty,
        estimatedValue: (fd.get("estimatedValue") as string) || null,
        currency:
          (((fd.get("currency") as string) || "").trim().toUpperCase() ||
            initial.currency),
        buDepartment: department,
        notes: (fd.get("notes") as string) ?? null,
      });

      if (result.success) {
        toast.success("Contract updated");
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
        Edit
      </Button>
      <Dialog open={open} onOpenChange={(v) => (pending ? null : setOpen(v))}>
        <DialogContent className="sm:max-w-2xl">
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>Edit contract</DialogTitle>
              <DialogDescription>
                Update core details. Changes are recorded on the timeline.
              </DialogDescription>
            </DialogHeader>

            <div className="my-4 grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  name="title"
                  defaultValue={initial.title}
                  maxLength={255}
                  required
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="counterparty">Counterparty</Label>
                  <Input
                    id="counterparty"
                    name="counterparty"
                    defaultValue={initial.counterparty}
                    maxLength={255}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="type">Type</Label>
                  <Select value={type} onValueChange={(v) => v && setType(v)}>
                    <SelectTrigger id="type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTRACT_TYPES.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="complexity">Complexity</Label>
                  <Select
                    value={complexity}
                    onValueChange={(v) => setComplexity((v as Complexity) || "")}
                  >
                    <SelectTrigger id="complexity">
                      <SelectValue placeholder="(none)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="department">BU department</Label>
                  <Select
                    value={department}
                    onValueChange={(v) => v && setDepartment(v)}
                  >
                    <SelectTrigger id="department">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BU_DEPARTMENTS.map((d) => (
                        <SelectItem key={d} value={d}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_8rem]">
                <div className="grid gap-2">
                  <Label htmlFor="estimatedValue">Estimated value</Label>
                  <Input
                    id="estimatedValue"
                    name="estimatedValue"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={initial.estimatedValue ?? ""}
                    placeholder="Optional"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="currency">Currency</Label>
                  <Input
                    id="currency"
                    name="currency"
                    defaultValue={initial.currency}
                    maxLength={3}
                    className="uppercase"
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  rows={3}
                  maxLength={2000}
                  defaultValue={initial.notes ?? ""}
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
    </>
  );
}
