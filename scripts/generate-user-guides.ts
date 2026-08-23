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

function render(guide: Guide): void {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  doc.pipe(createWriteStream(path.join(OUTPUT_DIR, guide.file)));

  doc.font("Helvetica-Bold").fontSize(18).text("CDC Lab Accounts System");
  doc.font("Helvetica-Bold").fontSize(13).text(`Quick Guide — ${guide.audience}`);
  doc.moveDown(0.4);
  doc.font("Helvetica").fontSize(9.5).text(guide.intro, { align: "left" });
  doc.moveDown(0.6);

  for (const section of guide.sections) {
    doc.font("Helvetica-Bold").fontSize(10.5).text(section.heading);
    doc.moveDown(0.15);
    doc.font("Helvetica").fontSize(9);
    for (const line of section.body) {
      doc.text(`•  ${line}`, { indent: 4, paragraphGap: 2 });
    }
    doc.moveDown(0.4);
  }

  doc
    .moveDown(0.3)
    .font("Helvetica-Oblique")
    .fontSize(7.5)
    .text(
      "CDC Laboratories, Gujranwala. All amounts are in PKR. Nothing in this system is ever deleted — archiving keeps the history. Questions: contact your system administrator.",
    );

  doc.end();
  console.log(`Wrote ${path.join(OUTPUT_DIR, guide.file)}`);
}

render(OPERATOR_GUIDE);
render(PARTNER_GUIDE);
