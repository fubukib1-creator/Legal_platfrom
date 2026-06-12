"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { registerContract } from "@/server/actions/contracts";
import { CONTRACT_TYPES } from "@/lib/contract-types";
import type { BUTeamOption, BUUserOption } from "@/server/queries/contracts";

type Props = {
  teams: BUTeamOption[];
  buUsersByTeam: Record<string, BUUserOption[]>;
};

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type Complexity = "LOW" | "MEDIUM" | "HIGH";

const COMPLEXITY_OPTIONS: ReadonlyArray<{ id: Complexity; label: string }> = [
  { id: "LOW", label: "Low" },
  { id: "MEDIUM", label: "Medium" },
  { id: "HIGH", label: "High" },
];

export function NewContractForm({ teams, buUsersByTeam }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState<string>(CONTRACT_TYPES[0].id);
  const [complexity, setComplexity] = useState<Complexity | "">("");
  const [team, setTeam] = useState<string>(teams[0]?.department ?? "");
  const [startDate, setStartDate] = useState<string>(todayIsoDate());
  const [buOwnerId, setBuOwnerId] = useState<string>(
    buUsersByTeam[teams[0]?.department ?? ""]?.[0]?.id ?? "",
  );

  function handleTeamChange(v: string) {
    setTeam(v);
    setBuOwnerId(buUsersByTeam[v]?.[0]?.id ?? "");
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const estimatedRaw = fd.get("estimatedValue") as string | null;
    const estimatedValue = estimatedRaw ? Number(estimatedRaw) : undefined;

    if (!team) {
      toast.error("Pick a BU team");
      return;
    }

    startTransition(async () => {
      const result = await registerContract({
        title: (fd.get("title") as string) ?? "",
        type: type as Parameters<typeof registerContract>[0]["type"],
        complexity: complexity === "" ? null : complexity,
        counterparty: (fd.get("counterparty") as string) ?? "",
        estimatedValue: Number.isFinite(estimatedValue) ? estimatedValue : undefined,
        currency: ((fd.get("currency") as string) || "THB").toUpperCase(),
        buDepartment: team,
        buOwnerId: buOwnerId || null,
        startDate: startDate || null,
        notes: ((fd.get("notes") as string) || null) ?? null,
      });

      if (result.success) {
        toast.success(`Created ${result.data.contractNumber}`);
        router.push(`/contracts/${result.data.id}`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  if (teams.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-slate-600">
            No active BU teams exist yet. Ask an admin to add at least one BU
            member or manager in <code>/admin/users</code> before registering a
            contract.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={onSubmit} className="flex flex-col gap-6">
          {/* Title spans full width */}
          <div className="grid gap-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" required maxLength={255} />
          </div>

          {/* Counterparty + type, evenly split */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="counterparty">Counterparty</Label>
              <Input id="counterparty" name="counterparty" required maxLength={255} />
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

          {/* Complexity — Legal categorises the contract for SLA + reporting */}
          <div className="grid gap-2">
            <Label htmlFor="complexity">Complexity</Label>
            <Select
              value={complexity}
              onValueChange={(v) => setComplexity((v as Complexity) || "")}
            >
              <SelectTrigger id="complexity">
                <SelectValue placeholder="Select complexity" />
              </SelectTrigger>
              <SelectContent>
                {COMPLEXITY_OPTIONS.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Team + BU owner */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="buTeam">BU team</Label>
              <Select value={team} onValueChange={(v) => v && handleTeamChange(v)}>
                <SelectTrigger id="buTeam">
                  <SelectValue placeholder="Select team" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((t) => (
                    <SelectItem key={t.department} value={t.department}>
                      {t.department}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {t.memberCount} member{t.memberCount === 1 ? "" : "s"}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="buOwner">BU owner</Label>
              <Select value={buOwnerId} onValueChange={(v) => v && setBuOwnerId(v)}>
                <SelectTrigger id="buOwner">
                  <SelectValue placeholder="Select owner" />
                </SelectTrigger>
                <SelectContent>
                  {(buUsersByTeam[team] ?? []).map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                      {u.role === "BU_MANAGER" && (
                        <span className="ml-2 text-xs text-muted-foreground">Manager</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Start date */}
          <div className="grid gap-2">
            <Label htmlFor="startDate">Start date</Label>
            <Input
              id="startDate"
              name="startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.currentTarget.value)}
              required
            />
          </div>

          {/* Estimated value + currency — value gets more space than currency */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_8rem]">
            <div className="grid gap-2">
              <Label htmlFor="estimatedValue">Estimated value</Label>
              <Input
                id="estimatedValue"
                name="estimatedValue"
                type="number"
                min="0"
                step="0.01"
                placeholder="Optional"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="currency">Currency</Label>
              <Input
                id="currency"
                name="currency"
                defaultValue="THB"
                maxLength={3}
                className="uppercase"
              />
            </div>
          </div>

          {/* Notes spans full width */}
          <div className="grid gap-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={3} maxLength={2000} />
          </div>

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/contracts")}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Register contract"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
