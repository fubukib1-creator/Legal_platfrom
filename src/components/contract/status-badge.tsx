import type { ContractStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STYLE: Record<ContractStatus, { label: string; className: string }> = {
  REGISTERED: { label: "Registered", className: "bg-slate-200 text-slate-900" },
  AWAITING_TEMPLATE: { label: "Awaiting template", className: "bg-slate-200 text-slate-900" },
  PENDING_BU_REVISION: { label: "Sent back to BU owner", className: "bg-yellow-100 text-yellow-900" },
  IN_LEGAL_REVIEW: { label: "In legal review", className: "bg-amber-100 text-amber-900" },
  WITH_COUNTERPARTY: { label: "With counterparty (legacy)", className: "bg-slate-200 text-slate-900" },
  CP_RESPONDED: { label: "CP responded (legacy)", className: "bg-slate-200 text-slate-900" },
  AWAITING_SIGNATURE: { label: "Awaiting signature", className: "bg-orange-100 text-orange-900" },
  OUT_FOR_SIGNING: { label: "Signed and Uploaded", className: "bg-green-200 text-green-950" },
  MONITORING: { label: "Signed (legacy)", className: "bg-green-100 text-green-900" },
  CANCELLED: { label: "Cancelled", className: "bg-red-100 text-red-900" },
};

export function StatusBadge({ status, className }: { status: ContractStatus; className?: string }) {
  const s = STYLE[status];
  return (
    <Badge variant="secondary" className={cn(s.className, "border-0", className)}>
      {s.label}
    </Badge>
  );
}
