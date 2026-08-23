/**
 * Generates the two one-page user guides SRS §10 requires **as PDFs**
 * ("One-page user guide | Client | Delivered as PDF, one version for
 * Operators and one for Partners"). Markdown would not satisfy that row.
 *
 * Uses `pdfkit`, already a dependency since Phase 5's Monthly Summary
 * export — no new package. Regenerate with `npm run docs:guides` whenever
 * a workflow changes, and commit the output so the handover pack is always
 * in the repository.
 *
 * Terminology throughout matches the existing workbook exactly
 * (NFR-USE-05, CLAUDE.md §22): Party, Daily-billing/Monthly-billing,
 * Counter Income, Direct Cash Receipt, Administration/Purchasing
 * Expenses, Instalment, Funding Source, Partner Investment, Operator,
 * Archive, PKR. English only (NFR-USE-08).
 */
import { createWriteStream, mkdirSync } from "node:fs";
import { finished } from "node:stream/promises";
import path from "node:path";
import PDFDocument from "pdfkit";

const OUTPUT_DIR = path.join("docs", "user-guides");

interface Section {
  heading: string;
  body: string[];
}

interface Guide {
  file: string;
  audience: string;
  intro: string;
  sections: Section[];
}

const OPERATOR_GUIDE: Guide = {
  file: "operator-guide.pdf",
  audience: "Operator (Reception)",
  intro:
    "This is everything you need for the daily routine. You record what comes in and what goes out; the system does all the adding up. You will never be asked to type a total.",
  sections: [
    {
      heading: "Signing in",
      body: [
        "Open the system and sign in with your email address and password. You stay signed in for 30 days, so you will rarely need to do this again on the same device.",
        "If you forget your password, use Forgot Password on the sign-in screen. After 10 wrong attempts the account locks itself for 15 minutes — wait, then try again.",
      ],
    },
    {
      heading: "Daily Expenses",
      body: [
        "Add Expense, then enter the amount and choose the item from the list. If the item is not listed, choose Other and type a description.",
        "Funding Source is Business unless a partner paid for it personally — in that case choose Partner and name them. Ask if you are unsure; it changes how the figure is counted.",
        "The date defaults to today. Change it if you are entering something from an earlier day.",
      ],
    },
    {
      heading: "Party Income — the daily grid",
      body: [
        "The grid has one column per daily-billing Party and one row per day of the month, exactly like the workbook.",
        "Type the amount in a cell and press Enter or Tab; it saves on its own. The arrow keys move between cells, so the whole grid works from the keyboard without touching the mouse.",
        "To remove a figure you entered by mistake, clear the cell. You will be asked to confirm, and it will name the Party and the date so you can be sure it is the right one.",
      ],
    },
    {
      heading: "Direct Cash Receipts",
      body: [
        "When a Party pays cash outside normal billing, use Record Cash Receipt on the Party Income screen. Do not type it into a grid cell — a cash receipt is recorded separately so the monthly total stays correct.",
      ],
    },
    {
      heading: "Counter Income",
      body: [
        "Record walk-in patient income here, separately from Party income.",
        "If you record a second amount for a day that already has one, the system points it out but still lets you save — sometimes there genuinely are two.",
      ],
    },
    {
      heading: "Working without internet",
      body: [
        "You can keep working. Entries are saved on the device and upload by themselves once the connection returns. The header shows how many are still waiting.",
        "Do not sign out while entries are still waiting — the system will warn you. Signing back in on the same device is fine; the entries are still there.",
      ],
    },
    {
      heading: "What you will not see",
      body: [
        "Profit, loss, partner investment, and the profit split are not shown to Operators. That is deliberate, not a fault, and not something a setting can change.",
      ],
    },
  ],
};

const PARTNER_GUIDE: Guide = {
  file: "partner-guide.pdf",
  audience: "Partner",
  intro:
    "You can do everything an Operator can, plus the monthly work and the financial results. Every figure you see is calculated live from the entries — nothing is a stored total, so it is always current.",
  sections: [
    {
      heading: "Dashboard",
      body: [
        "This month's income, expenses, and result, each shown next to last month's. A six-month trend chart and any warnings sit below.",
        "Warnings tell you when a recurring bill has no entry yet this month, or an Instalment line has not been generated.",
        "If entries are still waiting to upload from a device, the totals are marked provisional so you know the picture is not yet complete.",
      ],
    },
    {
      heading: "Monthly Expenses",
      body: [
        "Administration and Purchasing are totalled separately for display and combined for the profit calculation, exactly as in the workbook.",
        "The daily expense total appears automatically as a read-only Purchasing line. Do not re-enter it.",
        "Recurring Pre-fill copies last month's recurring categories forward. It always shows you what it will create and waits for you to confirm.",
      ],
    },
    {
      heading: "Assets and Instalments",
      body: [
        "An asset is either Instalment or Cash, never both.",
        "Instalment: set the monthly amount. It appears as an ordinary monthly expense and reduces profit. No partner is tagged against it.",
        "Cash: set the purchase price and the partner who paid. It is not an expense — it raises that partner's Partner Investment.",
        "Generate Instalment Lines creates this month's instalment expenses. It previews first and will not create a duplicate for a month that already has one.",
      ],
    },
    {
      heading: "Monthly Party Bills",
      body: [
        "One figure per monthly-billing Party per month. Correcting a figure is an ordinary edit, never a second entry.",
      ],
    },
    {
      heading: "Partner Investment",
      body: [
        "A running cumulative total per partner: capital put in, cash-purchased assets, and any expense a partner funded personally.",
        "Partner-funded costs are never repaid in cash — they raise the investment total instead. They also still appear in the expense listings by category, so spending never disappears from view.",
        "Investment never affects the profit split.",
      ],
    },
    {
      heading: "Monthly Summary and reports",
      body: [
        "Defaults to the current month; step months or set any custom date range. There is no month closing — every record stays editable, and the Change History records who changed what.",
        "Export the summary as a PDF laid out like the existing sheet, or the underlying entries to Excel. Every export shows the date produced, the range covered, and who produced it.",
      ],
    },
    {
      heading: "Change History",
      body: [
        "Every addition, edit, and archiving is recorded with who did it and when, including entries made offline. Filter by user, date, or record type, or open one record's own history from its History button.",
        "Nothing is ever deleted. Archive removes a record from the lists and keeps its history intact.",
      ],
    },
  ],
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 36;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_TOP = PAGE_HEIGHT - MARGIN - 18;

function pdfText(value: string): string {
  // The built-in PDF Helvetica font is deliberately used so the handover
  // pack has no font-file dependency. Normalize typographic dash variants
  // to ASCII hyphens for reliable rendering in every PDF viewer.
  return value.replace(/[\u2010-\u2015]/g, "-");
}

async function render(guide: Guide): Promise<void> {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, guide.file);
  const doc = new PDFDocument({
    size: "A4",
    margin: MARGIN,
    info: {
      Title: `CDC Lab Accounts System - Quick Guide - ${guide.audience}`,
      Author: "CDC Laboratories, Gujranwala",
      Subject: "One-page system user guide",
    },
  });
  const output = createWriteStream(outputPath);
  doc.pipe(output);
  let pageCount = 1;
  doc.on("pageAdded", () => {
    pageCount += 1;
  });

  doc.rect(0, 0, PAGE_WIDTH, 64).fill("#0F766E");
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(16.5);
  doc.text("CDC Lab Accounts System", MARGIN, 16, { width: CONTENT_WIDTH });
  doc.fontSize(10).text(pdfText(`Quick Guide - ${guide.audience}`), MARGIN, 40, {
    width: CONTENT_WIDTH,
  });

  doc.roundedRect(MARGIN, 74, CONTENT_WIDTH, 44, 6).fill("#ECFDF5");
  doc
    .fillColor("#134E4A")
    .font("Helvetica")
    .fontSize(8.6)
    .text(pdfText(guide.intro), MARGIN + 11, 84, {
      width: CONTENT_WIDTH - 24,
      lineGap: 0.25,
    });

  doc.y = 126;

  for (const section of guide.sections) {
    doc
      .fillColor("#0F766E")
      .font("Helvetica-Bold")
      .fontSize(9.5)
      .text(pdfText(section.heading), MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(0.1);
    doc.fillColor("#1F2937").font("Helvetica").fontSize(8.4);
    for (const line of section.body) {
      doc.text(pdfText(`- ${line}`), MARGIN + 3, doc.y, {
        width: CONTENT_WIDTH - 3,
        indent: 6,
        lineGap: 0.3,
        paragraphGap: 1,
      });
    }
    doc.moveDown(0.2);
  }

  doc
    .moveTo(MARGIN, FOOTER_TOP)
    .lineTo(PAGE_WIDTH - MARGIN, FOOTER_TOP)
    .lineWidth(0.5)
    .strokeColor("#99F6E4")
    .stroke();
  doc
    .fillColor("#4B5563")
    .font("Helvetica-Oblique")
    .fontSize(7)
    .text(
      pdfText(
        "CDC Laboratories, Gujranwala | All amounts are in PKR | Nothing is deleted - archiving keeps the history | August 2026",
      ),
      MARGIN,
      FOOTER_TOP + 8,
      { width: CONTENT_WIDTH, align: "center", lineBreak: false },
    );

  doc.end();
  await finished(output);
  if (pageCount !== 1) {
    throw new Error(`${guide.file} rendered as ${pageCount} pages; the SRS requires one page.`);
  }
  console.log(`Wrote ${outputPath}`);
}

await Promise.all([render(OPERATOR_GUIDE), render(PARTNER_GUIDE)]);
