import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const TILES = [
  { href: "/admin/users", title: "Users", description: "Add new users, deactivate accounts." },
  { href: "/admin/holidays", title: "Holidays", description: "Manage Thai public holidays used for SLA math." },
];

export default async function AdminPage() {
  const session = await auth();
  if (session?.user.role !== "ADMIN") {
    redirect("/contracts");
  }
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-slate-500">System configuration.</p>
      </header>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {TILES.map((t) => (
          <Link key={t.href} href={t.href} className="block">
            <Card className="transition-colors hover:bg-slate-50">
              <CardHeader>
                <CardTitle>{t.title}</CardTitle>
                <CardDescription>{t.description}</CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
