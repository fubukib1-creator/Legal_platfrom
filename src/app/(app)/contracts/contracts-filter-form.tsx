"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ContractStatus, ContractType, Role } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CONTRACT_TYPES } from "@/lib/contract-types";

// Status labels — kept in sync with the (non-legacy) status list the parent
// page passes in. Legacy statuses (AWAITING_TEMPLATE / WITH_COUNTERPARTY /
// CP_RESPONDED / MONITORING) stay in the map because the enum still includes
// them, but they're not surfaced in the filter UI.
const STATUS_LABEL: Record<ContractStatus, string> = {
  REGISTERED: "Registered",
  AWAITING_TEMPLATE: "Awaiting template",
  DRAFTING: "Drafting",
  IN_LEGAL_REVIEW: "In legal review",
  WITH_COUNTERPARTY: "With counterparty",
  CP_RESPONDED: "CP responded",
  AWAITING_SIGNATURE: "Awaiting signature",
  OUT_FOR_SIGNING: "Signed and Uploaded",
  MONITORING: "Monitoring",
  CANCELLED: "Cancelled",
};

const SLA_LABEL: Record<string, string> = {
  breached: "Past deadline",
  warning: "Deadline approaching",
};

type Props = {
  statuses: ContractStatus[];
  departments: string[];
  selectedStatuses: ContractStatus[];
  selectedDepartments: string[];
  selectedTypes: ContractType[];
  selectedSLA: string[];
  defaultSearch: string;
  role: Role;
};

export function ContractsFilterForm({
  statuses,
  departments,
  selectedStatuses,
  selectedDepartments,
  selectedTypes,
  selectedSLA,
  defaultSearch,
  role,
}: Props) {
  // BU teams only need to see their own work, so the cross-department BU
  // filter and the SLA filter (a legal-team monitoring tool) are hidden.
  const isBU = role === "BU_MANAGER" || role === "BU_MEMBER";
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function applyParams(updates: Record<string, string | string[] | undefined>) {
    const next = new URLSearchParams(params.toString());
    next.delete("page");
    for (const [k, v] of Object.entries(updates)) {
      next.delete(k);
      if (Array.isArray(v)) for (const item of v) next.append(k, item);
      else if (v) next.set(k, v);
    }
    startTransition(() => {
      router.push(`/contracts?${next.toString()}`);
    });
  }

  function onSearchSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const term = ((fd.get("search") as string) || "").trim();
    applyParams({ search: term || undefined });
  }

  const anyFilter =
    selectedStatuses.length > 0 ||
    selectedDepartments.length > 0 ||
    selectedTypes.length > 0 ||
    selectedSLA.length > 0;

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={onSearchSubmit} className="flex gap-2">
        <Input
          name="search"
          defaultValue={defaultSearch}
          placeholder="Search by number, title, or counterparty"
          className="max-w-md"
        />
        <Button type="submit" variant="outline" disabled={pending}>
          Search
        </Button>
        {defaultSearch ? (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => applyParams({ search: undefined })}
          >
            Clear
          </Button>
        ) : null}
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <FilterDropdown
          label="Status"
          options={statuses.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
          selected={selectedStatuses}
          onChange={(next) => applyParams({ status: next })}
          disabled={pending}
        />
        {!isBU ? (
          <FilterDropdown
            label="SLA"
            options={Object.entries(SLA_LABEL).map(([value, label]) => ({
              value,
              label,
            }))}
            selected={selectedSLA}
            onChange={(next) => applyParams({ sla: next })}
            disabled={pending}
          />
        ) : null}
        {!isBU ? (
          <FilterDropdown
            label="Department"
            options={departments.map((d) => ({ value: d, label: d }))}
            selected={selectedDepartments}
            onChange={(next) => applyParams({ department: next })}
            disabled={pending}
          />
        ) : null}
        <FilterDropdown
          label="Type"
          options={CONTRACT_TYPES.map((t) => ({ value: t.id, label: t.label }))}
          selected={selectedTypes}
          onChange={(next) => applyParams({ type: next })}
          disabled={pending}
        />
        {anyFilter ? (
          <Badge
            variant="outline"
            className="cursor-pointer"
            onClick={() =>
              applyParams({
                status: [],
                department: [],
                type: [],
                sla: [],
              })
            }
          >
            Clear filters
          </Badge>
        ) : null}
      </div>
    </div>
  );
}

// Lightweight dropdown — toggled button, popover with checkbox list, click
// outside to close. Selecting/unselecting fires onChange immediately so the
// caller can push the new URL state.
function FilterDropdown<V extends string>({
  label,
  options,
  selected,
  onChange,
  disabled,
}: {
  label: string;
  options: Array<{ value: V; label: string }>;
  selected: V[];
  onChange: (next: V[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle(value: V) {
    const set = new Set(selected);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    onChange(Array.from(set));
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-lg border border-input bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted",
          selected.length > 0 && "border-primary",
          disabled && "opacity-50",
        )}
      >
        {label}
        {selected.length > 0 ? (
          <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-primary-foreground">
            {selected.length}
          </span>
        ) : null}
        <span aria-hidden="true" className="text-xs text-muted-foreground">
          ▾
        </span>
      </button>
      {open ? (
        <div
          role="listbox"
          aria-multiselectable="true"
          className="absolute left-0 top-full z-30 mt-1 flex max-h-72 min-w-48 flex-col overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md"
        >
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              No options
            </div>
          ) : (
            options.map((opt) => {
              const checked = selected.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground",
                    checked && "bg-accent/60",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(opt.value)}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                  <span>{opt.label}</span>
                </label>
              );
            })
          )}
          {selected.length > 0 ? (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-1 border-t border-border px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted"
            >
              Clear all
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
