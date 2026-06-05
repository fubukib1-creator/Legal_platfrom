import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SLABadgeKind } from "@/lib/sla";

export function SLABadge({ badge }: { badge: SLABadgeKind }) {
  switch (badge.kind) {
    case "awaiting-pickup":
      return (
        <Badge variant="secondary" className="border-0 bg-slate-200 text-slate-900">
          Not yet started
        </Badge>
      );
    case "breached":
      return (
        <Badge
          variant="secondary"
          className={cn("border-0", "bg-red-100 text-red-900")}
        >
          Past deadline · {badge.daysOver}d late
        </Badge>
      );
    case "warning":
      return (
        <Badge
          variant="secondary"
          className={cn("border-0", "bg-amber-100 text-amber-900")}
        >
          Due in {badge.daysRemaining}d
        </Badge>
      );
    case "on-track":
      return (
        <Badge
          variant="secondary"
          className={cn("border-0", "bg-emerald-100 text-emerald-900")}
        >
          {badge.daysRemaining}d left
        </Badge>
      );
    case "completed":
      return (
        <Badge
          variant="secondary"
          className={cn(
            "border-0",
            badge.late ? "bg-orange-100 text-orange-900" : "bg-green-100 text-green-900",
          )}
        >
          {badge.late ? "Done (late)" : "Done"}
        </Badge>
      );
  }
}
