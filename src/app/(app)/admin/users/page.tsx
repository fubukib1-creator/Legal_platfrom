import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserCreateForm, UserTableRow } from "./user-controls";

export default async function AdminUsersPage() {
  const session = await auth();
  if (session?.user.role !== "ADMIN") redirect("/contracts");

  const [users, contractCounts] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        department: true,
        active: true,
        createdAt: true,
      },
    }),
    prisma.contract.groupBy({
      by: ["buOwnerId"],
      where: { status: { not: "CANCELLED" } },
      _count: { id: true },
    }),
  ]);

  const contractCountByUser = new Map(
    contractCounts.map((r) => [r.buOwnerId, r._count.id]),
  );

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-slate-500">{users.length} accounts</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add user</CardTitle>
        </CardHeader>
        <CardContent>
          <UserCreateForm />
        </CardContent>
      </Card>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Contracts</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <UserTableRow
                key={u.id}
                user={u}
                contractCount={contractCountByUser.get(u.id) ?? 0}
                isSelf={u.id === session.user.id}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
