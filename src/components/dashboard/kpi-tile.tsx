import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  value: number | string;
  accent?: "default" | "danger" | "warning" | "success";
  hint?: string;
};

const ACCENT: Record<NonNullable<Props["accent"]>, string> = {
  default: "text-slate-900 dark:text-slate-100",
  danger: "text-red-600",
  warning: "text-amber-600",
  success: "text-emerald-600",
};

export function KPITile({ label, value, accent = "default", hint }: Props) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
        <div className={cn("mt-1 text-3xl font-semibold leading-tight", ACCENT[accent])}>
          {value}
        </div>
        {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}
