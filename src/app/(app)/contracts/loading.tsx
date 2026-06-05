import { Skeleton } from "@/components/shared/skeleton";

export default function ContractsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-10 w-full max-w-md" />
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
