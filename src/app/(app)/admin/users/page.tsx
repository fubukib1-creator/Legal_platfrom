import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { UserCreateForm, UserActiveToggle, UserEditButton, BUUserContractsButton } from "./user-controls";

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
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell className="text-sm text-slate-600">{u.email}</TableCell>
                <TableCell className="font-mono text-xs">{u.role}</TableCell>
                <TableCell>{u.department}</TableCell>
                <TableCell>
                  {u.active ? (
                    <Badge variant="secondary" className="border-0 bg-green-100 text-green-900">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="border-0 bg-slate-200 text-slate-700">
                      Inactive
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  {u.role === "BU_MEMBER" || u.role === "BU_MANAGER" ? (
                    <BUUserContractsButton
                      userId={u.id}
                      userName={u.name}
                      department={u.department}
                      contractCount={contractCountByUser.get(u.id) ?? 0}
                    />
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <UserEditButton
                      user={{
                        id: u.id,
                        name: u.name,
                        email: u.email,
                        role: u.role,
                        department: u.department,
                      }}
                      isSelf={u.id === session.user.id}
                    />
                    <UserActiveToggle
                      userId={u.id}
                      active={u.active}
                      isSelf={u.id === session.user.id}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
