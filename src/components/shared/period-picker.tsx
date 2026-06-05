"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { monthKeyLabel } from "@/lib/period";

type Props = {
  kind: "month" | "year";
  value: string;
  monthKeys: string[];
  yearKeys: string[];
};

// Compact "show me {Month} {Year-MM}" / "show me Year {YYYY}" toolbar.
// Drives both the dashboard and Legal performance pages via URL searchparams.
export function PeriodPicker({ kind, value, monthKeys, yearKeys }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function navigate(nextKind: "month" | "year", nextValue: string) {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("period", nextKind);
    sp.set("value", nextValue);
    startTransition(() => {
      router.push(`${pathname}?${sp.toString()}`);
    });
  }

  function onKindChange(nextKind: "month" | "year") {
    if (nextKind === kind) return;
    // When switching kinds, reset the value to the most recent option so the
    // picker doesn't end up showing a stale month label under a year mode.
    const fallback = nextKind === "month" ? monthKeys[0] : yearKeys[0];
    navigate(nextKind, fallback);
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card px-4 py-3">
      <div className="grid gap-1.5">
        <Label htmlFor="period-kind" className="text-xs text-muted-foreground">
          View
        </Label>
        <Select
          value={kind}
          onValueChange={(v) => onKindChange(v as "month" | "year")}
        >
          <SelectTrigger id="period-kind" className="w-[8rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="month">By month</SelectItem>
            <SelectItem value="year">By year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="period-value" className="text-xs text-muted-foreground">
          {kind === "month" ? "Month" : "Year"}
        </Label>
        {kind === "month" ? (
          <Select value={value} onValueChange={(v) => v && navigate("month", v)}>
            <SelectTrigger id="period-value" className="w-[12rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthKeys.map((k) => (
                <SelectItem key={k} value={k}>
                  {monthKeyLabel(k)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Select value={value} onValueChange={(v) => v && navigate("year", v)}>
            <SelectTrigger id="period-value" className="w-[8rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearKeys.map((k) => (
                <SelectItem key={k} value={k}>
                  {k}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {pending ? (
        <span className="text-xs text-muted-foreground">Loading…</span>
      ) : null}
    </div>
  );
}
