import { NextRequest, NextResponse } from "next/server";
import { headers as nextHeaders } from "next/headers";
import { prisma } from "../../../../../server/prisma";
import { getAuthenticatedUser } from "../../../../../server/session";
import { PermissionDeniedError } from "../../../../../lib/permissions/guard";
import {
  parseCustomDateRange,
  formatKarachiTimestamp,
} from "../../../../../lib/domain/calendar-date";
import { UnsafeDecimalExportError } from "../../../../../lib/domain/decimal-export";
import {
  getMonthlyResultTotals,
  getItemizedExpenseBreakdown,
} from "../../../../../server/queries/results";
import { generateMonthlySummaryExcel } from "../../../../../server/reports/monthly-summary-excel";
import { safeReportFilename } from "../../../../../server/reports/export-safety";

/** FR-RPT-07/08 — same authorization-first, in-memory-buffer, no-temp-file discipline as the PDF route. */
export async function GET(request: NextRequest) {
  const currentUser = await getAuthenticatedUser(await nextHeaders());

  const from = request.nextUrl.searchParams.get("from") ?? "";
  const to = request.nextUrl.searchParams.get("to") ?? "";
  const range = parseCustomDateRange(from, to);
  if (!range) {
    return NextResponse.json({ error: "Invalid date range." }, { status: 400 });
  }

  try {
    const totals = await getMonthlyResultTotals(prisma, currentUser, range);
    const { administration, purchasing } = await getItemizedExpenseBreakdown(
      prisma,
      currentUser,
      range,
    );
    const actor = await prisma.user.findUnique({
      where: { id: currentUser!.id },
      select: { fullName: true },
    });
    const generatedAtKarachi = formatKarachiTimestamp();
    const buffer = await generateMonthlySummaryExcel(
      prisma,
      range,
      totals,
      administration,
      purchasing,
      actor?.fullName ?? "Unknown",
      generatedAtKarachi,
    );

    const filename = safeReportFilename(`${range.from}_to_${range.to}`, new Date(), "xlsx");
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    if (error instanceof UnsafeDecimalExportError) {
      return NextResponse.json({ error: "Export failed a data-safety check." }, { status: 500 });
    }
    throw error;
  }
}
