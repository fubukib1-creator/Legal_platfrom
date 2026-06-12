import type { ContractStatus } from "@prisma/client";
import { cn } from "@/lib/utils";

type Step = { status: ContractStatus; label: string; short: string };

// The visible lifecycle. Five stages — OUT_FOR_SIGNING is the terminal
// "Signed and Uploaded" stage. AWAITING_TEMPLATE / MONITORING / the legacy
// CP stages (WITH_COUNTERPARTY, CP_RESPONDED) are reserved in the DB enum
// but not part of the tracked flow.
const STEPS: ReadonlyArray<Step> = [
  { status: "REGISTERED",          label: "Registered",            short: "Reg"    },
  { status: "IN_LEGAL_REVIEW",     label: "Legal review",          short: "Review" },
  { status: "PENDING_BU_REVISION", label: "Send back to BU owner", short: "Revise" },
  { status: "AWAITING_SIGNATURE",  label: "Awaiting signature",    short: "Sign"   },
  { status: "OUT_FOR_SIGNING",     label: "Signed and Uploaded",   short: "Signed" },
];

type Props = {
  status: ContractStatus;
  currentRound: number;
};

export function ContractStageProgress({ status, currentRound }: Props) {
  if (status === "CANCELLED") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
        <span className="font-medium">This contract has been cancelled.</span>
        <span className="text-xs uppercase tracking-wide opacity-70">Cancelled</span>
      </div>
    );
  }

  const currentIdx = STEPS.findIndex((s) => s.status === status);
  const safeIdx = currentIdx === -1 ? 0 : currentIdx;
  // Terminal: "Signed and Uploaded" means every stage is complete.
  const isTerminal = status === "OUT_FOR_SIGNING";

  return (
    <ol className="flex w-full items-start gap-1 overflow-x-auto px-1 py-3 sm:gap-0">
      {STEPS.map((step, i) => {
        const isComplete = i < safeIdx || (isTerminal && i === safeIdx);
        const isCurrent = !isTerminal && i === safeIdx;
        const isFuture = i > safeIdx;

        return (
          <li
            key={step.status}
            className={cn(
              "relative flex min-w-[64px] flex-1 flex-col items-center gap-1.5 px-1",
              i < STEPS.length - 1 ? "after:absolute after:left-1/2 after:top-3 after:hidden after:h-0.5 after:w-full after:translate-x-3 after:rounded sm:after:block" : "",
              isComplete
                ? "after:bg-slate-900 dark:after:bg-slate-100"
                : "after:bg-slate-200 dark:after:bg-slate-700",
            )}
          >
            <div
              className={cn(
                "z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-semibold transition-colors",
                isComplete &&
                  "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900",
                isCurrent &&
                  "border-blue-600 bg-blue-50 text-blue-700 ring-4 ring-blue-100 dark:border-blue-400 dark:bg-blue-950 dark:text-blue-200 dark:ring-blue-950/60",
                isFuture &&
                  "border-slate-300 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500",
              )}
              aria-current={isCurrent ? "step" : undefined}
            >
              {isComplete ? (
                <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M2 6.5L4.5 9L10 3.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            <span
              className={cn(
                "text-center text-[10px] leading-tight sm:text-xs",
                isComplete && "text-slate-700 dark:text-slate-300",
                isCurrent && "font-semibold text-blue-700 dark:text-blue-300",
                isFuture && "text-slate-400 dark:text-slate-500",
              )}
            >
              <span className="hidden sm:inline">{step.label}</span>
              <span className="sm:hidden">{step.short}</span>
              {isCurrent && currentRound > 0 ? (
                <span className="block text-[10px] font-normal text-slate-500">
                  Round {currentRound}
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
