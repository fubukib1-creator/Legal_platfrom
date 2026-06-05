import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { listBUTeams } from "@/server/queries/contracts";
import { NewContractForm } from "./new-contract-form";

export default async function NewContractPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "contract:create")) {
    redirect("/contracts");
  }
  const teams = await listBUTeams();
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Register a contract</h1>
        <p className="text-sm text-slate-500">
          Legal creates and tracks the contract. Pick the BU team so they can
          follow the stage updates.
        </p>
      </header>
      <NewContractForm teams={teams} />
    </div>
  );
}
