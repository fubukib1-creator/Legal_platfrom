import { Skeleton } from "@/components/shared/skeleton";

export default function ContractDetailLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-2 h-7 w-2/3" />
        <Skeleton className="mt-2 h-4 w-1/2" />
      </div>
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-32" />
      <Skeleton className="h-24" />
      <Skeleton className="h-64" />
    </div>
  );
}
