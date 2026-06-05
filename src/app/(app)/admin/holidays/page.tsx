import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatInTimeZone } from "date-fns-tz";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  HolidayCreateForm,
  HolidayDeleteButton,
  HolidayEmptyStateLoad,
  HolidayYearViewSelect,
} from "./holiday-controls";

export default async function AdminHolidaysPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const session = await auth();
  if (session?.user.role !== "ADMIN") redirect("/contracts");

  const allHolidays = await prisma.holiday.findMany({
    orderBy: { date: "asc" },
  });

  // Distinct years with data, ascending.
  const yearsWithData = Array.from(
    new Set(allHolidays.map((h) => h.year)),
  ).sort((a, b) => a - b);

  const currentYear = new Date().getUTCFullYear();
  const sp = await searchParams;
  const requested = Number(sp.year);
  // Pick a sensible default: current year if it has data, else the most
  // recent year with data, else the current year.
  const fallback =
    yearsWithData.length === 0
      ? currentYear
      : yearsWithData.includes(currentYear)
        ? currentYear
        : yearsWithData[yearsWithData.length - 1];
  const selectedYear =
    Number.isInteger(requested) && requested >= 2000 && requested <= 2100
      ? requested
      : fallback;

  const holidaysForYear = allHolidays.filter((h) => h.year === selectedYear);

  // Year list shown in both pickers — distinct years with data plus a small
  // forward window so admins can switch to and load future years even before
  // any rows exist.
  const earliestPicker = Math.min(currentYear - 2, ...(yearsWithData.length ? yearsWithData : [currentYear]));
  const latestPicker = Math.max(currentYear + 5, ...(yearsWithData.length ? yearsWithData : [currentYear]));
  const pickerYears = Array.from(
    { length: latestPicker - earliestPicker + 1 },
    (_, i) => earliestPicker + i,
  );

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Holidays</h1>
        <p className="text-sm text-slate-500">
          Used by SLA business-day math. Editing affects deadlines computed after this point.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add holiday manually</CardTitle>
        </CardHeader>
        <CardContent>
          <HolidayCreateForm />
        </CardContent>
      </Card>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-end gap-3">
            <HolidayYearViewSelect
              selected={selectedYear}
              years={pickerYears}
              yearsWithData={yearsWithData}
            />
            <p className="pb-1 text-xs text-slate-500">
              {holidaysForYear.length} holiday{holidaysForYear.length === 1 ? "" : "s"} in {selectedYear}
            </p>
          </div>
        </div>

        {holidaysForYear.length === 0 ? (
          <HolidayEmptyStateLoad year={selectedYear} />
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">Date</TableHead>
                  <TableHead className="w-32">Day</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {holidaysForYear.map((h) => {
                  const key = formatInTimeZone(h.date, "UTC", "yyyy-MM-dd");
                  const dayName = formatInTimeZone(h.date, "UTC", "EEEE");
                  return (
                    <TableRow key={key}>
                      <TableCell className="font-mono text-xs">{key}</TableCell>
                      <TableCell className="text-sm text-slate-600">{dayName}</TableCell>
                      <TableCell>{h.name}</TableCell>
                      <TableCell className="text-right">
                        <HolidayDeleteButton date={key} name={h.name} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
