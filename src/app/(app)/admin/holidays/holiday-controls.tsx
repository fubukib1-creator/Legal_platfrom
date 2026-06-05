"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
  addHoliday,
  loadHolidaysFromExternal,
  removeHoliday,
} from "@/server/actions/admin";

export function HolidayCreateForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await addHoliday({
        date: (fd.get("date") as string) ?? "",
        name: (fd.get("name") as string) ?? "",
      });
      if (r.success) {
        toast.success("Holiday added");
        (e.target as HTMLFormElement).reset();
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="grid gap-2">
        <Label htmlFor="date">Date</Label>
        <Input id="date" name="date" type="date" required />
      </div>
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required maxLength={120} />
      </div>
      <div className="sm:col-span-3 flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Add holiday"}
        </Button>
      </div>
    </form>
  );
}

// Shown in place of the holiday table when the selected year has no records.
// Hosts the "Load Thai public holidays" action so admins don't need a
// separate top-of-page card for it.
export function HolidayEmptyStateLoad({ year }: { year: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onLoad() {
    startTransition(async () => {
      const r = await loadHolidaysFromExternal({ year });
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      const { inserted, existing, fetched } = r.data;
      if (fetched === 0) {
        toast.warning(
          `No holidays available for ${year}. The library may not yet have data for that year — add holidays manually.`,
        );
      } else if (inserted === 0) {
        toast.info(
          `${year}: all ${existing} source holidays are already in the calendar.`,
        );
      } else {
        toast.success(
          `${year}: added ${inserted} holiday${
            inserted === 1 ? "" : "s"
          }${existing > 0 ? ` (${existing} already existed)` : ""}.`,
        );
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
      <p>No holidays recorded for {year}.</p>
      <Button type="button" onClick={onLoad} disabled={pending}>
        {pending ? "Loading…" : `Load Thai public holidays for ${year}`}
      </Button>
      <p className="max-w-lg text-xs">
        This pulls the standard Thai public holidays for {year} (fixed-date
        and Buddhist lunar days). It does <strong>not</strong> include
        substitution Mondays for holidays falling on weekends — the Thai
        cabinet announces those year-by-year — so review the loaded list and
        add any missing substitutions with the form above.
      </p>
    </div>
  );
}

export function HolidayYearViewSelect({
  selected,
  years,
  yearsWithData,
}: {
  selected: number;
  years: ReadonlyArray<number>;
  yearsWithData: ReadonlyArray<number>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const dataSet = new Set(yearsWithData);

  function onChange(v: string | null) {
    if (v == null) return;
    const y = Number(v);
    if (!Number.isInteger(y)) return;
    startTransition(() => {
      router.push(`/admin/holidays?year=${y}`);
    });
  }

  return (
    <div className="grid gap-1.5">
      <Label htmlFor="view-year">View year</Label>
      <Select value={String(selected)} onValueChange={onChange} disabled={pending}>
        <SelectTrigger id="view-year" className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}
              {dataSet.has(y) ? null : (
                <span className="ml-1 text-xs text-slate-400">(empty)</span>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function HolidayDeleteButton({ date, name }: { date: string; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (!confirm(`Remove holiday "${name}" on ${date}?`)) return;
    startTransition(async () => {
      const r = await removeHoliday({ date });
      if (r.success) {
        toast.success("Holiday removed");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick} disabled={pending}>
      Remove
    </Button>
  );
}
