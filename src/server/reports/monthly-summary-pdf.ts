import PDFDocument from "pdfkit";
import { formatMoney } from "../../lib/domain/money-format";
import { Decimal } from "../../lib/domain/money";
import type { MonthlyResultTotals, ItemizedCategoryLine } from "../queries/results";

export interface MonthlySummaryPdfInput {
  range: { from: string; to: string };
  totals: MonthlyResultTotals;
  administration: ItemizedCategoryLine[];
  purchasing: ItemizedCategoryLine[];
  generatedByFullName: string;
  generatedAtKarachi: string;
}

/**
 * FR-RPT-06/08: A4 PDF, laid out like the existing workbook — header
 * (system name, range, generated-at/-by), itemised income/expense lines,
 * net result, partner split (or the configuration-required state). Built
 * entirely in memory (`chunks`/`Buffer.concat`) — never written to a temp
 * file — and returned only after the caller has already authorized the
 * request (this module never checks permissions itself).
 */
export function generateMonthlySummaryPdf(input: MonthlySummaryPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text("CDC Lab Accounts System", { align: "left" });
    doc.fontSize(14).text(`Monthly Summary — ${input.range.from} to ${input.range.to}`);
    doc
      .fontSize(9)
      .fillColor("#555555")
      .text(`Generated ${input.generatedAtKarachi} (Asia/Karachi) by ${input.generatedByFullName}`);
    doc.fillColor("#000000").moveDown(1);

    function section(title: string) {
      doc.moveDown(0.5).fontSize(12).text(title, { underline: true }).fontSize(10);
    }

    function line(label: string, amount: string) {
      doc.text(`${label}: ${formatMoney(amount)}`);
    }

    function categoryLine(item: ItemizedCategoryLine) {
      const suffix =
        item.fundingSource === "PARTNER" ? " (Partner-funded — excluded from profit)" : "";
      line(`${item.categoryName}${suffix}`, item.amount);
    }

    section("Income");
    line("Counter Income", input.totals.totalCounterIncome);
    line("Party Income (daily, monthly, and direct cash)", input.totals.totalPartyIncome);
    doc.font("Helvetica-Bold");
    line("Total Income", input.totals.totalIncome);
    doc.font("Helvetica");

    section("Administration Expenses");
    if (input.administration.length === 0) {
      doc.text("No entries in this range.");
    } else {
      for (const item of input.administration) {
        categoryLine(item);
      }
    }

    section("Purchasing Expenses");
    line("Daily Expenses (system-generated line)", input.totals.dailyExpenseBusinessTotal);
    const dailyExpensePartnerTotal = new Decimal(input.totals.dailyExpenseTotal).minus(
      input.totals.dailyExpenseBusinessTotal,
    );
    if (dailyExpensePartnerTotal.greaterThan(0)) {
      line(
        "Daily Expenses (Partner-funded — excluded from profit)",
        dailyExpensePartnerTotal.toString(),
      );
    }
    for (const item of input.purchasing) {
      categoryLine(item);
    }

    doc.moveDown(0.5).font("Helvetica-Bold");
    line("Total Expenses (Business-funded)", input.totals.totalExpenses);
    line("Net Profit / Loss", input.totals.netResult);
    doc.font("Helvetica");

    section("Partner Split");
    if (input.totals.split.isConfigured) {
      line(
        `${input.totals.split.partnerAName} (${input.totals.split.splitAPercent}%)`,
        input.totals.split.shareA!,
      );
      line(
        `${input.totals.split.partnerBName} (${input.totals.split.splitBPercent}%)`,
        input.totals.split.shareB!,
      );
    } else {
      doc
        .fillColor("#ba1a1a")
        .text("Partner mapping is not yet configured — no split is shown.")
        .fillColor("#000000");
    }

    doc.end();
  });
}
