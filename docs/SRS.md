**SOFTWARE REQUIREMENTS SPECIFICATION**

Lab Accounts & Asset Management System

**CDC LABORATORIES, GUJRANWALA**

| **Document Version** | 3.0 |
| --- | --- |
| **Status** | For client review and sign-off |
| **Date** | 19 August 2026 |
| **Prepared by** | Saad Naseer, Lead Developer |
| **Supersedes** | Proposal v1.1; SRS v1.0; SRS v2.0 |
| **Basis** | Client answers of 17 August 2026, and the complete JULY 26 workbook |
| **Standard** | IEEE 830, tailored |

| **All business rules are now confirmed**<br>Version 2.0 of this document rested on eighteen unconfirmed assumptions. All have since been answered by the client, and the design has changed substantially as a result.<br>Three features specified in v2.0 have been removed: month closing and locking, the separation of capital from running costs, and the partner reimbursement settlement. One major feature has been added: offline data entry with automatic synchronisation.<br>Section 11 lists every change from v2.0 and the client answer behind it. Nothing in this document is an assumption. |
| --- |

# Contents

*If the list below appears empty, select it and press F9 (or right-click and choose "Update Field") to build it.*

# 1.  Introduction

## 1.1  Purpose

This document specifies the requirements for the Lab Accounts & Asset Management System to be built for CDC Laboratories, Gujranwala. The system replaces the manual Excel workbook currently used to record income and expenses and to work out the monthly result.

It serves two audiences. For CDC Laboratories it sets out exactly what will be built, and forms the basis of acceptance and sign-off. For any engineer maintaining the system in future it is the authoritative record of what the system does and why.

## 1.2  Guiding Principle

The client’s instruction was that the system should do automatically what is being done by hand today — not introduce new accounting practice. Every calculation in this specification reproduces the existing workbook. Where this document adds something, it is to remove the re-typing of figures, not to change how the business measures itself.

## 1.3  Scope

**In scope:**

- Daily expense entry from a managed item list, with free-text entry also available

- Daily income entry for parties that bill daily; monthly entry for parties that bill monthly

- Recording of direct cash receipts that fall outside the daily grid

- Daily counter income entry, with the monthly total calculated

- Monthly administration and purchasing expenses, totalled together

- Machine instalments recorded as an editable monthly amount per machine

- Asset register for fixed and movable equipment, added to over time

- Partner investment tracking, including partner-funded costs and cash-bought equipment

- Automatic profit or loss for any date range, defaulting to the current month

- Partner share of profit or loss, 50/50 by default and editable

- Offline data entry with automatic upload when the connection returns

- Warnings for monthly bills and instalments not yet entered

- Full change history, and export to PDF and Excel

**Out of scope:**

- Payroll processing, bank integration and payment gateways

- Patient registration and diagnostic test results

- Tax filing and integration with accounting packages

- Asset depreciation

- Outstanding instalment balances and end dates (see FR-AST-05)

- Month closing and locking (explicitly declined by the client)

- Multiple currencies, multiple branches, native mobile applications

## 1.4  Definitions

| **Term** | **Meaning** |
| --- | --- |
| **Party** | A referring laboratory or hospital that sends work to CDC. Called "Parties" in the existing workbook. |
| **Daily-billing party** | A party whose income is entered day by day. Four parties work this way today. |
| **Monthly-billing party** | A party whose income is entered as one figure for the month. Most parties work this way. |
| **Counter Income** | Income from walk-in patients paying at the reception counter for tests. Separate from party income. |
| **Direct Cash Receipt** | Money received from a party in cash, outside the normal daily billing. Historically recorded outside the sheet. |
| **Administration Expenses** | Recurring monthly overheads — salaries, rent, utilities, courier, waste disposal. |
| **Purchasing Expenses** | Payments to vendors for kits, chemicals and lab supplies. Grouped with administration for totalling. |
| **Instalment** | A fixed monthly payment towards a machine. Counts as an ordinary expense. |
| **Funding Source** | Whether an expense was paid by the business or personally by a partner. Determines whether it reduces profit or increases that partner’s investment. |
| **Partner Investment** | The running total a partner has put into the business. Recorded for transparency; never affects the profit split. |
| **Operator** | Reception staff who enter transactions but cannot see financial results. |
| **Archive** | Marking a record inactive so it leaves the totals but stays visible in history. Records are never deleted. |
| **PKR** | Pakistani Rupee. The only currency handled by the system. |

## 1.5  References

| **Ref** | **Document** |
| --- | --- |
| **REF-1** | Project Proposal & Requirements Document, Version 1.1 |
| **REF-2** | CDC Laboratories workbook, sheet "JULY 26" — complete version, received 19 August 2026 |
| **REF-3** | Client answers to requirements questionnaire, dated 17 August 2026 |
| **REF-4** | User interface prototype (Google Stitch) — indicative layout only |
| **REF-5** | IEEE Std 830-1998, Recommended Practice for Software Requirements Specifications |

## 1.6  Conventions

- Requirement identifiers (FR-XXX-00, NFR-XXX-00) are permanent. A retired identifier is never reused.

- Priority: M = Must have for launch. S = Should have, may be deferred. C = Could have if time permits.

- Every requirement traces to a client answer in REF-3 or to the workbook in REF-2.

# 2.  Overall Description

## 2.1  The Existing System

The current process is one Excel sheet per month, printed across two pages. July 2026 contains four blocks of data:

| **Block** | **Contents** | **July 2026** |
| --- | --- | --- |
| **Income summary** | Counter Income plus 26 named parties, all with figures. | Rs 1,495,535 |
| **Expense summary** | 16 administration lines and 10 purchasing lines, totalled together. | Rs 1,295,459 |
| **Daily expenses** | One row per day: date, item purchased, cost. | Rs 171,190 |
| **Party daily income** | One column per daily-billing party, one row per day. | Rs 225,650 |

**July 2026 result: a profit of Rs 200,076. **Every total in the workbook reconciles exactly — income, both expense groups, the daily expense total, and the net result. The arithmetic is sound. The weakness is not in the calculations but in how figures move between blocks.

## 2.2  Why the System Is Needed

Two figures are calculated in one block and re-typed into another: the daily expense total is copied into the purchasing list, and each daily-billing party’s monthly total is copied into the income summary. Re-typing is where error enters.

| **Evidence — income recorded outside the sheet**<br>For three of the four daily-billing parties, the daily entries agree exactly with the income summary: Give Lab 79,000; Accurate 76,650; Shahadat 18,000.<br>Best Lab does not. The daily entries total 52,000 while the summary records 79,000 — a difference of 27,000. The same party showed a 19,000 difference in the earlier working copy of the same month.<br>The client has confirmed the summary figure is correct: the difference is cash paid directly, which was never written onto the daily sheet.<br>So the money is real and correctly counted, but 27,000 of income exists only as a number in a summary cell, with no record of when it arrived or what it was for. Requirement FR-INC-06 gives those receipts a place to live, so the detail and the total can never diverge again. |
| --- |

## 2.3  Treatment of Machine Instalments

The purchasing list contains three instalment lines in July 2026: Data Diagnostics (Rs 50,000), Lab Medikal Sol (Rs 100,000) and Zynotic Diagnostics (Rs 100,000). The client has confirmed how these are to be handled:

- They are payments towards machines, and each machine appears in the asset register.

- The monthly amount is fixed, and must be editable at any time in case an instalment rises or falls.

- They count as ordinary monthly expenses and reduce profit, exactly as the current sheet does.

An earlier draft of this specification proposed separating capital from running costs so that instalments would not reduce profit. The client has declined that approach, and it has been removed. The system now reproduces the existing profit calculation without modification.

Perfect Medical Systems (Rs 101,350) was queried and is confirmed as a chemicals vendor, not an instalment. It is an ordinary purchasing expense.

## 2.4  Treatment of Partner-Funded Costs

When a partner pays a business cost from his own pocket, the client has confirmed that the business does not repay him. Instead the amount is added to that partner’s cumulative investment.

**The rule, confirmed with the client using a worked example:**

| **Situation** | **Effect on profit** | **Effect on investment** |
| --- | --- | --- |
| **Business pays the 62,000 utility bill** | Counts as an expense. Profit falls by 62,000. | None |
| **Partner A pays the 62,000 utility bill personally** | Not an expense. Profit is unchanged. | Partner A’s investment rises by 62,000 |
| **Machine bought on instalment** | Monthly instalment counts as an expense. | None. No partner is tagged. |
| **Machine bought outright in cash by Partner A** | Not an expense. | Partner A’s investment rises by the purchase price |

**A partner-funded cost is still recorded as an expense line. **It is marked as partner-funded, which excludes it from the profit calculation and adds it to that partner’s investment instead. It still appears in expense reports by category, so a month where a partner paid the utility bill personally does not show a misleading zero against Utility Bill. This was agreed with the client specifically to avoid a blind spot in reporting.

## 2.5  Product Perspective

The system is new and self-contained, with no dependency on other CDC software. It serves a single business with a small, fixed number of users. Historical figures may be imported from the existing workbooks at launch.

## 2.6  User Classes

The client has confirmed that data entry happens at the lab reception, by whoever is on duty. This is a different population from the two partners, and the system therefore has three roles rather than two.

| **Role** | **Who** | **Can do** | **Cannot do** |
| --- | --- | --- | --- |
| **Operator** | Reception staff on duty | Enter daily expenses, party income, counter income and cash receipts. View the entries they and others have made. | See profit or loss, partner investment, settings or user management. |
| **Partner** | The two business owners | Everything an Operator can, plus monthly expenses, assets, capital, and all financial reports. | Manage users, master lists or the profit split. |
| **Admin** | A partner holding elevated rights | Everything, plus user management, master lists and the profit split setting. | — |

Separating the Operator role matters: reception staff need to enter transactions all day, but the monthly result and the partners’ investment positions are not information they should see.

## 2.7  Operating Environment

- Web application accessed through a browser. No software installation required.

- A desktop or laptop at the reception counter is the primary device. Phones and tablets are supported.

- Current versions of Chrome, Edge, Firefox and Safari.

- The lab has a UPS and mains power is generally reliable, but the internet connection is not guaranteed. Entry must continue during an outage.

- Cloud-hosted, chosen to keep the monthly running cost low.

## 2.8  Constraints

| **ID** | **Constraint** |
| --- | --- |
| **CON-01** | The system must reproduce the existing workbook’s figures exactly for any month where the underlying data is unchanged. |
| **CON-02** | Monthly hosting cost must be kept to a minimum. |
| **CON-03** | Single currency (PKR). |
| **CON-04** | Financial records are never physically deleted. Removal is by archiving only. |
| **CON-05** | Adding, editing or removing a party, expense item or category must never alter a figure already recorded. |
| **CON-06** | There is no month close or lock. Any record remains editable, which makes the change history the only safeguard against silent alteration. |
| **CON-07** | The system will be maintained long-term by a single developer. Simplicity and documentation take priority over performance optimisation. |

# 3.  Functional Requirements

Priority: M = Must have for launch, S = Should have, C = Could have.

## 3.1  Authentication and Roles (AUTH)

| **ID** | **Requirement** | **Priority** |
| --- | --- | --- |
| **FR-AUTH-01** | The system shall require a user to sign in with an email address and password before any data is shown. | M |
| **FR-AUTH-02** | Passwords shall be stored using a current industry-standard hashing algorithm with a per-user salt, and never in a readable form. | M |
| **FR-AUTH-03** | The system shall support three roles: Operator, Partner and Admin, with the permissions set out in Section 2.6. | M |
| **FR-AUTH-04** | An Operator shall not be able to reach any screen or figure showing profit, loss, partner investment or the profit split, whether through the interface or by direct request to the server. | M |
| **FR-AUTH-05** | A signed-in session shall persist across browser restarts for 30 days, so reception staff are not asked to sign in repeatedly. | M |
| **FR-AUTH-06** | The system shall provide password reset by a single-use email link that expires after 60 minutes. | M |
| **FR-AUTH-07** | The system shall limit repeated failed sign-in attempts and temporarily lock an account after 10 consecutive failures. | M |
| **FR-AUTH-08** | Every server request shall independently verify the user’s identity and role. Hiding a control in the interface shall never be the only protection. | M |
| **FR-AUTH-09** | The system shall provide sign-out that ends the session on the server, and shall warn if entries are still waiting to upload. | M |

## 3.2  Daily Expenses (DEXP)

| **ID** | **Requirement** | **Priority** |
| --- | --- | --- |
| **FR-DEXP-01** | The system shall record a daily expense with: date, item, amount, and funding source. | M |
| **FR-DEXP-02** | The item shall be selectable from a managed list, and shall also accept free text for anything not on the list. | M |
| **FR-DEXP-03** | An Admin shall be able to add, rename and archive items on the list. Changing the list shall never alter an expense already recorded. | M |
| **FR-DEXP-04** | The date shall default to today and shall be changeable, so entries can be made a day or two late. | M |
| **FR-DEXP-05** | The funding source shall be recorded as either Business or Partner. Where Partner is chosen, the system shall require the partner to be named. | M |
| **FR-DEXP-06** | The system shall reject amounts that are zero, negative or non-numeric, with a clear message beside the field. | M |
| **FR-DEXP-07** | The system shall show daily expenses for the selected date range in date order with a running total, filterable by item and funding source. | M |
| **FR-DEXP-08** | The total of daily expenses for a period shall be calculated by the system and shall never be typed by a user. | M |
| **FR-DEXP-09** | A daily expense may be edited or archived at any time. The previous values shall be kept in the change history. | M |
| **FR-DEXP-10** | The system should allow a photograph of a receipt to be attached to an expense. | C |

## 3.3  Party Income (PINC)

| **ID** | **Requirement** | **Priority** |
| --- | --- | --- |
| **FR-PINC-01** | The system shall maintain a list of parties, each marked as either daily-billing or monthly-billing. | M |
| **FR-PINC-02** | For daily-billing parties the system shall provide a grid with days as rows and active daily-billing parties as columns, matching the layout of the existing workbook. | M |
| **FR-PINC-03** | For monthly-billing parties the system shall accept one figure per party per month. | M |
| **FR-PINC-04** | A party may be added, renamed, switched between daily and monthly billing, or archived at any time. The list may be empty. | M |
| **FR-PINC-05** | Changing or archiving a party shall never alter any income figure already recorded against it. | M |
| **FR-PINC-06** | The system shall record a direct cash receipt against a party, with date, amount and a note, for money received outside the normal billing. | M |
| **FR-PINC-07** | The monthly total for each party shall be the sum of its daily entries, its monthly figure and its cash receipts, calculated by the system and never typed. | M |
| **FR-PINC-08** | The system shall show, for any date range, the total per party and the combined party income. | M |
| **FR-PINC-09** | Where a party has no income recorded in a period, the system shall show it as zero rather than omitting it. | M |

## 3.4  Counter Income (CINC)

| **ID** | **Requirement** | **Priority** |
| --- | --- | --- |
| **FR-CINC-01** | The system shall record counter income daily, as one figure per day. | M |
| **FR-CINC-02** | The monthly counter income total shall be calculated from the daily entries and never typed. | M |
| **FR-CINC-03** | The system shall show counter income both as a daily list and as a monthly total. | M |
| **FR-CINC-04** | The system shall warn, without blocking, when a counter income entry already exists for the chosen date. | M |
| **FR-CINC-05** | The system shall show which days in the current month have no counter income recorded. | S |

## 3.5  Monthly Expenses (MEXP)

*Administration and purchasing expenses are entered separately but totalled together, as in the existing workbook.*

| **ID** | **Requirement** | **Priority** |
| --- | --- | --- |
| **FR-MEXP-01** | The system shall record a monthly expense with: month, group (Administration or Purchasing), category, vendor where applicable, amount and funding source. | M |
| **FR-MEXP-02** | The system shall provide a managed list of expense categories, and an Admin shall be able to add, rename and archive them. | M |
| **FR-MEXP-03** | The total of daily expenses shall appear automatically as a line within Purchasing, as it does in the existing sheet. This line shall be read-only. | M |
| **FR-MEXP-04** | The system shall total Administration and Purchasing separately for display, and combine them into a single expense total for the profit calculation. | M |
| **FR-MEXP-05** | The funding source rules of FR-DEXP-05 shall apply equally to monthly expenses. | M |
| **FR-MEXP-06** | The system shall offer to create the current month’s recurring lines from the previous month, with amounts pre-filled and requiring confirmation before saving. | S |
| **FR-MEXP-07** | A monthly expense may be edited or archived at any time, with previous values kept in the change history. | M |
| **FR-MEXP-08** | The system shall allow the same category to appear more than once in a month, with a warning, so that a genuine duplicate payment can be recorded but an accidental one is noticed. | M |

## 3.6  Asset Register and Instalments (AST)

| **ID** | **Requirement** | **Priority** |
| --- | --- | --- |
| **FR-AST-01** | The asset register shall start empty. Assets shall be added by the client over time as equipment is identified or purchased. | M |
| **FR-AST-02** | The system shall record an asset with: name, classification (Fixed or Movable), acquisition mode (Instalment or Cash Purchase), vendor, and date. | M |
| **FR-AST-03** | For an asset acquired on instalment, the system shall record a fixed monthly instalment amount, editable at any time. | M |
| **FR-AST-04** | The monthly instalment for each active asset shall appear as a monthly expense line and shall reduce profit like any other expense. No partner shall be tagged against it. | M |
| **FR-AST-05** | Instalments shall run open-ended. The system shall not track a total price, an end date or an outstanding balance. These may be added in a later version if the client requires them. | M |
| **FR-AST-06** | For an asset bought outright in cash by a partner, the system shall record which partner bought it and the purchase price. The amount shall be added to that partner’s investment and shall not count as an expense. | M |
| **FR-AST-07** | An asset shall be either an instalment purchase or a cash purchase, never both. | M |
| **FR-AST-08** | Assets may be added, edited and archived at any time. Archiving an asset shall stop its instalment appearing in future months but shall not alter any month already recorded. | M |
| **FR-AST-09** | The system shall show the asset register filterable by classification, acquisition mode and status, with a total of purchase prices where known. | M |
| **FR-AST-10** | Depreciation shall not be calculated. | M |

## 3.7  Partner Investment (INV)

| **ID** | **Requirement** | **Priority** |
| --- | --- | --- |
| **FR-INV-01** | The system shall maintain a running investment total for each partner. | M |
| **FR-INV-02** | A partner’s investment total shall be the sum of: direct capital contributions, expenses marked as partner-funded, and cash-bought assets recorded against that partner. | M |
| **FR-INV-03** | The system shall record a direct capital contribution with date, partner, amount and note. | M |
| **FR-INV-04** | The system shall record money withdrawn by a partner, reducing that partner’s investment total. | S |
| **FR-INV-05** | The system shall present a statement per partner listing every item making up the total, with a running balance. | M |
| **FR-INV-06** | The investment total shall never affect the profit split or any other calculation. It is recorded for transparency only. | M |
| **FR-INV-07** | Partner investment figures shall be visible to Partners and Admins only. | M |

## 3.8  Results and Date Range (RES)

*The client has explicitly declined month closing and locking. The month is a view, selected by a date filter, not a state the data is placed into.*

| **ID** | **Requirement** | **Priority** |
| --- | --- | --- |
| **FR-RES-01** | The system shall calculate results for any date range chosen by the user. | M |
| **FR-RES-02** | The date range shall default to the first and last day of the current month. | M |
| **FR-RES-03** | The user shall be able to set any start and end date, and to move to the previous or next month in one action. | M |
| **FR-RES-04** | Total income shall be counter income plus all party income within the range. | M |
| **FR-RES-05** | Total expenses shall be all daily and monthly expenses within the range whose funding source is Business, including machine instalments. | M |
| **FR-RES-06** | Expenses whose funding source is Partner shall be excluded from total expenses, while still appearing in expense listings by category. | M |
| **FR-RES-07** | Net profit or loss shall be total income minus total expenses. | M |
| **FR-RES-08** | The system shall divide the result between the two partners using the split held in settings, defaulting to 50/50, and shall apply the same split to a loss. | M |
| **FR-RES-09** | The result shall be presented as an itemised breakdown showing every figure that went into it, so a partner can check the arithmetic by hand against the old sheet. | M |
| **FR-RES-10** | The system shall show a monthly summary laid out in the same shape as the existing workbook: income lines, expense lines, and the result. | M |
| **FR-RES-11** | Results shall be calculated on demand from the underlying entries. No result shall be stored as an editable figure. | M |

## 3.9  Warnings and Reminders (WARN)

| **ID** | **Requirement** | **Priority** |
| --- | --- | --- |
| **FR-WARN-01** | The system shall list recurring monthly expense categories that have no entry for the current month. | M |
| **FR-WARN-02** | The system shall list active instalment assets whose monthly expense line has not been entered for the current month. | M |
| **FR-WARN-03** | Warnings shall be shown on the dashboard and shall never block entry or calculation. | M |
| **FR-WARN-04** | The system shall warn when a monthly expense amount differs markedly from the same category in the previous month. | S |
| **FR-WARN-05** | A warning shall be dismissible for the current month where the omission is deliberate. | S |

## 3.10  Offline Operation (OFF)

*The client has confirmed that entry must continue during an internet outage, and that data must upload accurately once the connection returns. This is the most technically demanding requirement in the specification.*

| **ID** | **Requirement** | **Priority** |
| --- | --- | --- |
| **FR-OFF-01** | The system shall be installable to a device as a Progressive Web App and shall load without a network connection once installed. | M |
| **FR-OFF-02** | The system shall permit daily expense, party income, counter income and cash receipt entry while offline, storing entries on the device. | M |
| **FR-OFF-03** | The system shall show the connection state and the number of entries waiting to upload, visibly, on every screen. | M |
| **FR-OFF-04** | The system shall upload waiting entries automatically when the connection returns, without the user having to act. | M |
| **FR-OFF-05** | The system shall provide a manual upload control. | M |
| **FR-OFF-06** | Every entry shall be given a unique identifier on the device at the moment it is created, and the server shall use it to ensure a repeated upload can never create a duplicate. | M |
| **FR-OFF-07** | Entries shall be uploaded in the order they were captured. | M |
| **FR-OFF-08** | Where the same record has been changed both on a device and on the server, the system shall keep both versions and ask the user which to keep. Neither version shall be discarded automatically. | M |
| **FR-OFF-09** | Entries waiting to upload shall be kept on the device indefinitely until uploaded or explicitly discarded by the user. | M |
| **FR-OFF-10** | The system shall warn before any action that would discard entries not yet uploaded, including sign-out. | M |
| **FR-OFF-11** | Each entry shall record both the time it was captured on the device and the time it reached the server. | M |
| **FR-OFF-12** | Figures shown while offline shall be marked as provisional, since entries made on other devices will not yet be included. | M |
| **FR-OFF-13** | Reports and exports shall require a connection and shall not be available offline. | M |
| **FR-OFF-14** | The most recent 90 days of entries shall be readable offline. | S |

## 3.11  Master Data (MST)

| **ID** | **Requirement** | **Priority** |
| --- | --- | --- |
| **FR-MST-01** | An Admin shall be able to add, rename and archive parties, and set each party’s billing mode. | M |
| **FR-MST-02** | An Admin shall be able to add, rename and archive daily expense items. | M |
| **FR-MST-03** | An Admin shall be able to add, rename and archive monthly expense categories, and mark which are expected every month. | M |
| **FR-MST-04** | An Admin shall be able to add, rename and archive vendors. | M |
| **FR-MST-05** | Archiving any master record shall remove it from selection lists while leaving every historical entry unchanged. | M |
| **FR-MST-06** | An Admin shall be able to set the profit split percentages, which must total 100. | M |
| **FR-MST-07** | The system shall be delivered with the parties, categories and expense items from the July 2026 workbook already loaded. | M |

## 3.12  Change History (AUD)

*Because there is no month locking, any figure can be changed at any time. The change history is therefore the only record of what was altered and by whom, and is correspondingly important.*

| **ID** | **Requirement** | **Priority** |
| --- | --- | --- |
| **FR-AUD-01** | The system shall record an entry for every creation, change and archiving of any financial record. | M |
| **FR-AUD-02** | Each entry shall record the user, the time, the action, the record affected, and the values before and after. | M |
| **FR-AUD-03** | The change history shall be append-only. No part of the system shall provide any means of altering or deleting an entry. | M |
| **FR-AUD-04** | The system shall show the change history as a read-only list, filterable by user, date and record type. | M |
| **FR-AUD-05** | A user shall be able to see the change history of an individual record from that record’s own screen. | M |
| **FR-AUD-06** | The system shall highlight changes made to entries dated more than one month in the past, since these alter a result the partners may already have acted on. | S |
| **FR-AUD-07** | Sign-in, failed sign-in and password change events shall be recorded. | M |
| **FR-AUD-08** | For an entry made offline, the history shall record both the capture time and the upload time. | M |

## 3.13  Dashboard and Reports (RPT)

| **ID** | **Requirement** | **Priority** |
| --- | --- | --- |
| **FR-RPT-01** | The dashboard shall show income, expenses and result for the current month, with the previous month for comparison. | M |
| **FR-RPT-02** | The dashboard shall show outstanding warnings per Section 3.9 and the number of entries waiting to upload. | M |
| **FR-RPT-03** | The system shall show income and expenses across recent months as a trend. | M |
| **FR-RPT-04** | The system shall show expenses grouped by category, marking those that were partner-funded. | M |
| **FR-RPT-05** | The system shall show income by party across a chosen range. | M |
| **FR-RPT-06** | The system shall export the monthly summary as PDF, formatted for A4 and laid out like the existing sheet. | M |
| **FR-RPT-07** | The system shall export entries to Excel for a chosen range, one sheet per data type. | M |
| **FR-RPT-08** | Every export shall show the date produced, the range covered and the user who produced it. | M |
| **FR-RPT-09** | Reports containing profit, loss or investment shall not be available to an Operator. | M |

## 3.14  Historical Data Import (IMP)

| **ID** | **Requirement** | **Priority** |
| --- | --- | --- |
| **FR-IMP-01** | The system shall provide a defined Excel template for importing historical months. | M |
| **FR-IMP-02** | The system shall validate an uploaded file and show a preview with errors marked, before anything is saved. | M |
| **FR-IMP-03** | If any row fails validation the whole file shall be rejected. Partial import shall not occur. | M |
| **FR-IMP-04** | Imported records shall be identifiable as historical imports in the change history. | M |

# 4.  Non-Functional Requirements

## 4.1  Performance

For sizing, based on July 2026: about 30 daily expense entries, 60 to 90 party income entries, 31 counter income entries and 26 monthly expense lines per month. Fewer than 100 assets over the system’s life. This is a small-data system and performance risk is low.

| **ID** | **Requirement** | **Verification** |
| --- | --- | --- |
| **NFR-PERF-01** | The application shall load and become usable within 5 seconds on a normal connection. | Test |
| **NFR-PERF-02** | Moving between screens shall take no more than 1 second once loaded. | Test |
| **NFR-PERF-03** | Saving an entry shall confirm within 2 seconds when online, and within 500 milliseconds when offline. | Test |
| **NFR-PERF-04** | The monthly result shall be calculated and displayed within 3 seconds. | Test |
| **NFR-PERF-05** | A report export shall be produced within 15 seconds. | Test |
| **NFR-PERF-06** | Screens shall remain within these limits with three years of accumulated data. | Test |
| **NFR-PERF-07** | Uploading 200 entries held offline shall complete within 30 seconds. | Test |

## 4.2  Security

| **ID** | **Requirement** | **Verification** |
| --- | --- | --- |
| **NFR-SEC-01** | All traffic shall use HTTPS. Plain HTTP shall redirect permanently to HTTPS. | Inspection |
| **NFR-SEC-02** | The database and its backups shall be encrypted at rest. | Inspection |
| **NFR-SEC-03** | Every server endpoint shall verify identity and role independently of the interface. | Inspection |
| **NFR-SEC-04** | Financial results shall be withheld from Operators at the server, not merely hidden in the interface. | Test |
| **NFR-SEC-05** | All input shall be validated on the server regardless of validation in the browser. | Inspection |
| **NFR-SEC-06** | The system shall be protected against the OWASP Top 10, in particular injection and broken access control. | Analysis |
| **NFR-SEC-07** | Secrets and connection strings shall be held in environment configuration and never committed to the repository. | Inspection |
| **NFR-SEC-08** | Session cookies shall be HTTP-only, Secure and SameSite. | Inspection |
| **NFR-SEC-09** | Data held on a device for offline use shall be cleared on sign-out, once no entries are waiting to upload. | Test |
| **NFR-SEC-10** | Error messages shall not reveal stack traces, database structure or internal paths. | Test |

## 4.3  Reliability and Backup

| **ID** | **Requirement** | **Verification** |
| --- | --- | --- |
| **NFR-REL-01** | The database shall be backed up automatically at least once every 24 hours. | Inspection |
| **NFR-REL-02** | Backups shall be kept for at least 30 days, with one monthly backup kept for 12 months. | Inspection |
| **NFR-REL-03** | Restoring from backup shall be tested and documented before launch. | Demonstration |
| **NFR-REL-04** | No action by any user shall cause the permanent loss of a financial record. | Test |
| **NFR-REL-05** | No entry made offline shall be lost, including when the browser is closed or the device restarted before uploading. | Test |
| **NFR-REL-06** | Application errors shall be captured to a monitoring service with enough context to diagnose them. | Inspection |
| **NFR-REL-07** | Target availability is 99% per month, excluding planned maintenance. | Analysis |

## 4.4  Usability

| **ID** | **Requirement** | **Verification** |
| --- | --- | --- |
| **NFR-USE-01** | Recording a routine daily expense shall take no more than five interactions from the main screen. | Demonstration |
| **NFR-USE-02** | The daily party income grid shall be operable by keyboard alone, so a full day can be entered without reaching for the mouse. | Demonstration |
| **NFR-USE-03** | Amounts shall be shown with thousands separators and a consistent Rs indicator throughout. | Inspection |
| **NFR-USE-04** | Every save shall give clear visual confirmation of success or failure, including when saved offline. | Test |
| **NFR-USE-05** | The wording throughout shall match the terms already used in the workbook — Parties, Counter Income, Administration, Purchasing. | Inspection |
| **NFR-USE-06** | Archiving shall require confirmation naming the record affected. | Test |
| **NFR-USE-07** | The interface shall work on a phone screen without horizontal scrolling. | Test |
| **NFR-USE-08** | The interface shall be in English. | Inspection |

## 4.5  Maintainability

*These requirements exist because the system will be maintained for years, possibly by an engineer other than the original developer.*

| **ID** | **Requirement** | **Verification** |
| --- | --- | --- |
| **NFR-MNT-01** | The repository shall contain a README that lets a competent engineer run the system locally within 30 minutes. | Demonstration |
| **NFR-MNT-02** | The repository shall contain an .env.example listing every environment variable, with no real secrets. | Inspection |
| **NFR-MNT-03** | Each significant technical decision shall be recorded as a short Architecture Decision Record giving context, decision and alternatives rejected. | Inspection |
| **NFR-MNT-04** | The repository shall contain a deployment runbook covering deployment, rollback and backup restoration. | Inspection |
| **NFR-MNT-05** | All database changes shall be made through versioned migration files. Manual changes to the production database are prohibited. | Inspection |
| **NFR-MNT-06** | The result calculation shall be covered by automated tests, including the funding source rules and the July 2026 figures as a fixture. | Test |
| **NFR-MNT-07** | Offline upload and conflict handling shall be covered by automated tests, including repeated upload of the same entry. | Test |
| **NFR-MNT-08** | The codebase shall use static typing throughout, and the build shall fail on type errors. | Inspection |
| **NFR-MNT-09** | Code formatting and linting shall be enforced automatically on every change. | Inspection |

## 4.6  Compatibility

| **ID** | **Requirement** | **Verification** |
| --- | --- | --- |
| **NFR-CMP-01** | The system shall work on the current and previous major versions of Chrome, Edge, Firefox and Safari. | Test |
| **NFR-CMP-02** | The system shall work on Android 10 and later, and iOS 15 and later. | Test |
| **NFR-CMP-03** | Excel exports shall open without error in Microsoft Excel 2016 and later, and in Google Sheets. | Test |

# 5.  System Models

## 5.1  Use Case Diagram

Three actors. Partner inherits every Operator use case, and Admin inherits every Partner use case. Use cases shown in purple are performed by the system itself as part of another use case, never invoked directly.

![Embedded image](media/image-01.png)

*Figure 1 — Use Case Diagram*

## 5.2  Use Case Summary

| **ID** | **Use Case** | **Actor** | **Requirements** |
| --- | --- | --- | --- |
| **UC-01** | Log In | Operator | FR-AUTH-01 to 09 |
| **UC-02** | Record Daily Expense | Operator | FR-DEXP-01 to 10 |
| **UC-03** | Record Daily Party Income | Operator | FR-PINC-02, 07 |
| **UC-04** | Record Counter Income | Operator | FR-CINC-01 to 05 |
| **UC-05** | Record Direct Cash Receipt | Operator | FR-PINC-06 |
| **UC-06** | Record Monthly Expense | Partner | FR-MEXP-01 to 08 |
| **UC-07** | Record Monthly Party Bill | Partner | FR-PINC-03 |
| **UC-08** | Record Capital Contribution | Partner | FR-INV-03, 04 |
| **UC-09** | Manage Asset Register | Partner | FR-AST-01 to 10 |
| **UC-10** | View Monthly Summary | Partner | FR-RES-01 to 11 |
| **UC-11** | View Partner Investment | Partner | FR-INV-01 to 07 |
| **UC-12** | View Dashboard | Partner | FR-RPT-01 to 03 |
| **UC-13** | Export Report | Partner | FR-RPT-06 to 09 |
| **UC-14** | View Change History | Partner | FR-AUD-04 to 06 |
| **UC-15** | Manage Master Lists | Admin | FR-MST-01 to 07 |
| **UC-16** | Manage Users | Admin | FR-AUTH-03 |
| **UC-17** | Configure Profit Split | Admin | FR-MST-06, FR-RES-08 |
| **UC-18** | Calculate Monthly Result | System | FR-RES-04 to 09 |
| **UC-19** | Write History Entry | System | FR-AUD-01 to 03 |
| **UC-20** | Synchronise Offline Entries | System | FR-OFF-04 to 11 |
| **UC-21** | Warn of Unentered Bills | System | FR-WARN-01 to 05 |

## 5.3  Detailed Use Case Specifications

The three use cases below are specified in full because they carry the greatest business risk or technical complexity. The remainder follow the standard create, view, edit and archive behaviour already defined in Section 3.

**UC-02 — Record Daily Expense**

| **Actor** | Operator (reception staff on duty) |
| --- | --- |
| **Goal** | Record a purchase so it counts towards the period’s expenses. |
| **Preconditions** | User is signed in. |
| **Trigger** | A purchase is made, or the day’s purchases are entered at closing time. |
| **Main flow** | 1. User opens the daily expenses screen. The date range defaults to the current month.<br>2. System shows the entries so far with a running total.<br>3. User selects "Add expense".<br>4. System shows the form with today’s date pre-filled and funding source set to Business.<br>5. User picks an item from the list, or types a description not on the list.<br>6. User enters the amount.<br>7. User saves.<br>8. System validates, stores the entry, updates the total, and writes a history entry.<br>9. System confirms and returns to the list with the entry visible. |
| **Alternate flows** | 5a. The purchase was paid by a partner personally: the user sets funding source to Partner and names the partner. The entry still appears in expense listings but is excluded from the profit calculation and added to that partner’s investment.<br>6a. The amount is zero, negative or not a number: the system shows a message beside the field and does not save.<br>7a. There is no internet connection: the entry is stored on the device, the pending count increases, and the user is told the entry is saved and waiting to upload. Entry continues normally. |
| **Postconditions** | The expense is recorded, the period total reflects it, and the history shows who entered it and when. |
| **Requirements** | FR-DEXP-01 to 09, FR-OFF-02 to 06, FR-AUD-01, FR-AUD-02 |

**UC-10 — View Monthly Summary**

| **Actor** | Partner |
| --- | --- |
| **Goal** | See the result for a month, in the same shape as the existing workbook. |
| **Preconditions** | User is signed in as Partner or Admin. An Operator cannot reach this screen. |
| **Trigger** | The partners want to know how the month stands. |
| **Main flow** | 1. Partner opens the monthly summary. The range defaults to the first and last day of the current month.<br>2. System totals counter income and all party income for the range.<br>3. System totals daily and monthly expenses for the range where funding source is Business, including machine instalments.<br>4. System calculates net profit or loss as income minus expenses.<br>5. System applies the split from settings, 50/50 by default, and shows each partner’s share.<br>6. System displays the itemised breakdown: income lines, administration lines, purchasing lines, the daily expense total, the result, and the two partner shares.<br>7. System shows any warnings for bills or instalments not yet entered. |
| **Alternate flows** | 1a. Partner sets a different date range, or steps to another month. All figures recalculate.<br>4a. The result is a loss: the same split is applied, and each partner’s share is shown as a negative figure.<br>7a. Entries are waiting to upload from this device: the figures are marked provisional. |
| **Postconditions** | No data changes. Nothing is stored. The summary is calculated from the entries each time it is viewed. |
| **Requirements** | FR-RES-01 to 11, FR-WARN-01 to 03, FR-AUTH-04 |

**UC-20 — Synchronise Offline Entries**

| **Actor** | System (triggered by the connection returning) |
| --- | --- |
| **Goal** | Upload everything captured offline, exactly once, without losing or duplicating anything. |
| **Preconditions** | One or more entries are held on the device awaiting upload. The connection has returned. |
| **Trigger** | The browser reports that the connection is available, or the user presses "upload now". |
| **Main flow** | 1. System reads all waiting entries from device storage.<br>2. System orders them by the time they were captured.<br>3. System sends them to the server, each carrying the unique identifier assigned when it was created.<br>4. Server checks each identifier against those already stored, and ignores any it has seen before.<br>5. Server stores the new entries and records both the capture time and the upload time in the history.<br>6. Server confirms which entries were accepted.<br>7. System clears those entries from the waiting list and updates the count shown on screen.<br>8. System tells the user that everything has been uploaded. |
| **Alternate flows** | 3a. The connection drops mid-upload: entries not yet confirmed stay on the device and are retried. Because each carries its own identifier, a retry cannot create a second copy.<br>4a. The same record was also changed on another device: the server returns both versions, and the user is shown them and asked which to keep. Neither is discarded automatically.<br>5a. An entry fails validation on the server: it stays on the device, is flagged to the user with the reason, and the remaining entries continue to upload. |
| **Postconditions** | Every entry captured offline exists on the server exactly once. The waiting count is zero, or shows only entries the user must resolve. |
| **Requirements** | FR-OFF-04 to 12, FR-AUD-08, NFR-REL-05, NFR-MNT-07 |

## 5.4  Calculation Flow

How figures move through the system. Everything in the first group is typed by a person; everything after it is calculated. The second group is the rule confirmed with the client: an expense reduces profit only when the business paid it. A partner-funded cost still appears in expense reports but is added to that partner’s investment instead.

![Embedded image](media/image-02.png)

*Figure 2 — Calculation Flow and the Funding Source Rule*

## 5.5  Class Diagram

The domain model. Entry is an abstract base carrying what every record needs: amount, archive flag, the identifier assigned on the device, and the capture and upload times — which is what makes offline upload uniform across all four entry types. Expense adds the funding source rule, inherited by both daily and monthly expenses so the rule cannot be applied inconsistently.

![Embedded image](media/image-03.png)

*Figure 3 — Class Diagram (domain model and service layer)*

## 5.6  Sequence Diagram — Offline Entry and Upload

The most technically demanding part of the system. The key mechanism is the identifier generated on the device before anything is sent: because the server rejects an identifier it has already seen, an interrupted upload can be retried freely without any risk of the same expense being counted twice.

![Embedded image](media/image-04.png)

*Figure 4 — Sequence: Offline Entry and Synchronisation*

## 5.7  Entity Relationship Diagram

The database structure. Note what is absent compared with earlier drafts: there is no accounting period table, because the client declined month locking. A month is a date filter, not a stored state. The columns shaded amber and pink are the ones carrying the confirmed business rules — billing mode, receipt type, funding source and acquisition mode.

![Embedded image](media/image-05.png)

*Figure 5 — Entity Relationship Diagram*

# 6.  Database Design

Twelve tables. The principles behind the design:

- No accounting period table. The client declined month locking, so a month is a date range applied at query time, not a state.

- Money is stored as an exact decimal type, never as a floating point number.

- Nothing is deleted. Every entry table carries is_archived.

- Every entry table carries client_uuid, generated on the device, with a unique index. This is what makes repeated upload safe.

- Parties are rows, not columns. The workbook adds a column per daily-billing party; the database does not change shape when a party is added.

- No result is ever stored. Profit is calculated from the entries whenever it is asked for.

**users**

*Two partners plus reception staff.*

| **Column** | **Type** | **Constraints** | **Description** |
| --- | --- | --- | --- |
| **id** | UUID | PK | Primary key |
| **full_name** | VARCHAR(120) | NOT NULL | Name shown in the interface and history |
| **email** | VARCHAR(180) | NOT NULL, UNIQUE | Sign-in and password reset |
| **password_hash** | VARCHAR(255) | NOT NULL | Hashed, never reversible |
| **role** | ENUM | NOT NULL, 'OPERATOR' \| 'PARTNER' \| 'ADMIN' | Determines permissions |
| **is_partner** | BOOLEAN | NOT NULL, DEFAULT false | Marks the two owners; only these may be named as funding an expense |
| **is_active** | BOOLEAN | NOT NULL, DEFAULT true | Deactivated accounts cannot sign in |
| **created_at** | TIMESTAMPTZ | NOT NULL | Stored in UTC |

**parties**

*Referring labs and hospitals — the 26 names in the workbook’s income list.*

| **Column** | **Type** | **Constraints** | **Description** |
| --- | --- | --- | --- |
| **id** | UUID | PK | Primary key |
| **name** | VARCHAR(150) | NOT NULL, UNIQUE | e.g. GIVE LAB, FATIMA LAB |
| **billing_mode** | ENUM | NOT NULL, 'DAILY' \| 'MONTHLY' | Daily parties appear as columns in the entry grid; monthly parties take one figure |
| **is_active** | BOOLEAN | NOT NULL, DEFAULT true | Archived parties leave the lists but keep their history |
| **sort_order** | SMALLINT | NOT NULL | Preserves the order used in the existing sheet |

**expense_items**

*The dropdown list for daily expenses — water, parcel, strips, swabs and so on.*

| **Column** | **Type** | **Constraints** | **Description** |
| --- | --- | --- | --- |
| **id** | UUID | PK | Primary key |
| **name** | VARCHAR(120) | NOT NULL, UNIQUE | e.g. WATER, PARCEL, STRIPS |
| **is_active** | BOOLEAN | NOT NULL, DEFAULT true | Archived items keep their history |

**expense_categories**

*Monthly expense classification, covering both administration and purchasing.*

| **Column** | **Type** | **Constraints** | **Description** |
| --- | --- | --- | --- |
| **id** | UUID | PK | Primary key |
| **name** | VARCHAR(120) | NOT NULL, UNIQUE | e.g. STAFF PAY 1, RENT LAB, UTILITY BILL |
| **expense_group** | ENUM | NOT NULL, 'ADMIN' \| 'PURCHASING' | Displayed separately, totalled together |
| **is_recurring** | BOOLEAN | NOT NULL, DEFAULT false | Expected every month; drives the unentered-bill warning |
| **is_active** | BOOLEAN | NOT NULL, DEFAULT true | Archived categories keep their history |

**vendors**

*Suppliers named in the purchasing list.*

| **Column** | **Type** | **Constraints** | **Description** |
| --- | --- | --- | --- |
| **id** | UUID | PK | Primary key |
| **name** | VARCHAR(150) | NOT NULL, UNIQUE | e.g. REHMAN TRADERS, PERFECT MEDICAL SYS |
| **is_active** | BOOLEAN | NOT NULL, DEFAULT true | Archived vendors keep their history |

**daily_expenses**

*One row per purchase. Replaces the daily expense block on the right of the sheet.*

| **Column** | **Type** | **Constraints** | **Description** |
| --- | --- | --- | --- |
| **id** | UUID | PK | Primary key |
| **client_uuid** | UUID | NOT NULL, UNIQUE | Generated on the device before upload; makes repeated upload safe |
| **expense_date** | DATE | NOT NULL, INDEX | The day of the purchase |
| **expense_item_id** | UUID | FK → expense_items.id, NULL | Selected from the list where applicable |
| **custom_description** | VARCHAR(300) | NULL | Free text where the item is not on the list |
| **amount** | NUMERIC(14,2) | NOT NULL, CHECK > 0 | Exact decimal, never floating point |
| **funding_source** | ENUM | NOT NULL, 'BUSINESS' \| 'PARTNER' | PARTNER excludes it from profit and adds it to that partner’s investment |
| **funded_by_user_id** | UUID | FK → users.id, NULL | Required when funding_source = PARTNER |
| **is_archived** | BOOLEAN | NOT NULL, DEFAULT false | Archived rows leave the totals |
| **captured_at / synced_at** | TIMESTAMPTZ | NOT NULL / NULL | Device time and server time |
| **created_by / updated_by** | UUID | FK → users.id | Attribution |

**monthly_expenses**

*Administration and purchasing lines, including machine instalments.*

| **Column** | **Type** | **Constraints** | **Description** |
| --- | --- | --- | --- |
| **id** | UUID | PK | Primary key |
| **client_uuid** | UUID | NOT NULL, UNIQUE | As above |
| **period_month** | DATE | NOT NULL, INDEX | First day of the month the expense belongs to |
| **category_id** | UUID | FK → expense_categories.id | Administration or purchasing category |
| **vendor_id** | UUID | FK → vendors.id, NULL | For purchasing lines |
| **asset_id** | UUID | FK → assets.id, NULL | Set when the line is a machine instalment |
| **description** | VARCHAR(300) | NULL | Free text where useful |
| **amount** | NUMERIC(14,2) | NOT NULL, CHECK > 0 | Exact decimal |
| **funding_source** | ENUM | NOT NULL, 'BUSINESS' \| 'PARTNER' | Same rule as daily expenses |
| **funded_by_user_id** | UUID | FK → users.id, NULL | Required when funding_source = PARTNER |
| **is_archived** | BOOLEAN | NOT NULL, DEFAULT false | Archived rows leave the totals |

**party_income**

*All income from referring parties — daily entries, monthly bills and direct cash receipts in one table.*

| **Column** | **Type** | **Constraints** | **Description** |
| --- | --- | --- | --- |
| **id** | UUID | PK | Primary key |
| **client_uuid** | UUID | NOT NULL, UNIQUE | As above |
| **party_id** | UUID | FK → parties.id | The referring lab or hospital |
| **income_date** | DATE | NOT NULL, INDEX | Day for daily entries; first of month for monthly bills |
| **amount** | NUMERIC(14,2) | NOT NULL, CHECK > 0 | Exact decimal |
| **receipt_type** | ENUM | NOT NULL, 'DAILY' \| 'MONTHLY' \| 'CASH_DIRECT' | CASH_DIRECT records money that previously never reached the sheet |
| **note** | VARCHAR(300) | NULL | Particularly useful for cash receipts |
| **is_archived** | BOOLEAN | NOT NULL, DEFAULT false | Archived rows leave the totals |

**counter_income**

*Walk-in patient income, entered daily.*

| **Column** | **Type** | **Constraints** | **Description** |
| --- | --- | --- | --- |
| **id** | UUID | PK | Primary key |
| **client_uuid** | UUID | NOT NULL, UNIQUE | As above |
| **income_date** | DATE | NOT NULL, UNIQUE where not archived | One live entry per day |
| **amount** | NUMERIC(14,2) | NOT NULL, CHECK >= 0 | The day’s counter total |
| **note** | VARCHAR(300) | NULL | Optional |
| **is_archived** | BOOLEAN | NOT NULL, DEFAULT false | Archived rows leave the totals |

**assets**

*Fixed and movable equipment. Starts empty and is built up by the client over time.*

| **Column** | **Type** | **Constraints** | **Description** |
| --- | --- | --- | --- |
| **id** | UUID | PK | Primary key |
| **name** | VARCHAR(200) | NOT NULL | e.g. Haematology Analyser, Refrigerator, AC |
| **classification** | ENUM | NOT NULL, 'FIXED' \| 'MOVABLE' | Fixed = permanently installed |
| **acquisition_mode** | ENUM | NOT NULL, 'INSTALMENT' \| 'CASH' | Determines which columns below apply |
| **monthly_instalment** | NUMERIC(14,2) | NULL | INSTALMENT only. Editable at any time. No end date is held. |
| **purchase_price** | NUMERIC(14,2) | NULL | CASH only |
| **purchased_by_user_id** | UUID | FK → users.id, NULL | CASH only. Adds to that partner’s investment. Never set for instalments. |
| **vendor_id** | UUID | FK → vendors.id, NULL | Supplier |
| **acquired_on** | DATE | NULL | Date acquired, where known |
| **status** | ENUM | NOT NULL, 'ACTIVE' \| 'ARCHIVED' | Archived assets stop generating instalment lines |
| **—** | — | CHECK | INSTALMENT requires monthly_instalment and forbids purchased_by_user_id; CASH requires the reverse |

**capital_contributions**

*Direct injections and withdrawals of partner money.*

| **Column** | **Type** | **Constraints** | **Description** |
| --- | --- | --- | --- |
| **id** | UUID | PK | Primary key |
| **partner_user_id** | UUID | FK → users.id | The partner |
| **entry_date** | DATE | NOT NULL | Date of the contribution |
| **amount** | NUMERIC(14,2) | NOT NULL, CHECK > 0 | Exact decimal |
| **contribution_type** | ENUM | 'INITIAL' \| 'INJECTION' \| 'DRAWING' | DRAWING reduces the investment total |
| **note** | VARCHAR(500) | NULL | Purpose |
| **is_archived** | BOOLEAN | NOT NULL, DEFAULT false | Archived rows leave the totals |

**audit_log**

*Append-only. With no month locking, this is the only record of what changed.*

| **Column** | **Type** | **Constraints** | **Description** |
| --- | --- | --- | --- |
| **id** | BIGSERIAL | PK | Primary key |
| **actor_user_id** | UUID | FK → users.id | Who performed the action |
| **action** | ENUM | 'CREATE' \| 'UPDATE' \| 'ARCHIVE' \| 'LOGIN' \| 'IMPORT' | What was done |
| **entity_type** | VARCHAR(60) | NOT NULL, INDEX | Which table was affected |
| **entity_id** | VARCHAR(60) | NOT NULL, INDEX | Which record |
| **old_values** | JSONB | NULL | Values before the change |
| **new_values** | JSONB | NULL | Values after the change |
| **captured_at** | TIMESTAMPTZ | NOT NULL | When the action happened on the device |
| **synced_at** | TIMESTAMPTZ | NULL | When it reached the server |

**app_settings**

*Configuration held as data, so business rules can change without a deployment.*

| **Column** | **Type** | **Constraints** | **Description** |
| --- | --- | --- | --- |
| **setting_key** | VARCHAR(80) | PK | e.g. 'profit_split' |
| **setting_value** | JSONB | NOT NULL | e.g. { "partner_a": 50, "partner_b": 50 } |
| **updated_by / updated_at** | UUID / TIMESTAMPTZ | NOT NULL | Change attribution |

| **Two design points worth understanding**<br>client_uuid is what makes offline entry safe. The device creates the identifier before the entry is ever sent, and the server has a unique index on it. If the connection drops mid-upload and the device retries, the server simply recognises the identifier and ignores the duplicate. Without this column, an interrupted upload could count the same expense twice.<br>funding_source is the confirmed partner rule expressed in one column. Profit counts only rows where it is BUSINESS. Partner investment counts rows where it is PARTNER. The same rows appear in category reports either way, so no spending disappears from view. |
| --- |

# 7.  Data Integrity Rules

| **ID** | **Rule** |
| --- | --- |
| **DR-01** | Money is stored as an exact decimal type. Floating point representation of currency is prohibited. |
| **DR-02** | All timestamps are stored in UTC and displayed in Pakistan Standard Time (UTC+5). |
| **DR-03** | Every entry carries created_by, captured_at, updated_by and updated_at. |
| **DR-04** | Every entry carries is_archived. No financial record is ever physically deleted. |
| **DR-05** | Every entry carries a client_uuid with a unique index, so a repeated upload cannot create a duplicate. |
| **DR-06** | Referential integrity is enforced by the database. Archiving a party, vendor, item or category never alters a record referring to it. |
| **DR-07** | An expense with funding_source = PARTNER must name the partner. This is enforced by the database, not only by the interface. |
| **DR-08** | An asset is either an instalment or a cash purchase. The database rejects a row that is both or neither. |
| **DR-09** | No result is stored. Profit, loss and investment totals are always calculated from the underlying entries. |

# 8.  Business Rules

Every rule below is confirmed by the client. None is an assumption.

| **ID** | **Rule** | **Source** |
| --- | --- | --- |
| **BR-01** | Total income = counter income + all party income (daily, monthly and direct cash) for the period. | REF-2 |
| **BR-02** | Total expenses = all daily and monthly expenses for the period where funding source is Business, including machine instalments. | REF-3 Q3 |
| **BR-03** | Net profit or loss = total income − total expenses. | REF-2 |
| **BR-04** | Machine instalments count as ordinary expenses and reduce profit. They are not separated as capital. | REF-3 Q3 |
| **BR-05** | An expense paid personally by a partner is not a business expense. Profit is unaffected. | REF-3 Q5 |
| **BR-06** | An expense paid personally by a partner is added to that partner’s investment total, and is never repaid in cash. | REF-3 Q5 |
| **BR-07** | A partner-funded expense still appears in expense reports by category, so no spending disappears from view. | Client confirmation, 19 Aug |
| **BR-08** | A machine bought outright in cash is tagged to the purchasing partner and added to his investment. It is not an expense. | Client confirmation, 19 Aug |
| **BR-09** | A machine bought on instalment carries no partner tag. | Client confirmation, 19 Aug |
| **BR-10** | Profit and loss are divided 50/50 by default. The split is editable in settings and applies equally to losses. | REF-3 Q4, Q6 |
| **BR-11** | Partner investment totals never affect the profit split. They are recorded for transparency only. | Client confirmation, 19 Aug |
| **BR-12** | There is no month closing or locking. Any record may be edited at any time, and every change is recorded. | REF-3 Q14 |
| **BR-13** | Results are shown for a date range, defaulting to the current calendar month. | REF-3 Q14, Q15 |
| **BR-14** | Adding, editing or archiving a party, item or category never alters a figure already recorded. | REF-3, closing notes |
| **BR-15** | Financial records are archived, never deleted. | REF-1 |

# 9.  Acceptance Criteria

The system is accepted for live use when all of the following are demonstrated.

| **ID** | **Criterion** |
| --- | --- |
| **AC-01** | Every requirement marked priority M is implemented and verified by its stated method. |
| **AC-02** | The system reproduces the July 2026 figures exactly: income Rs 1,495,535, expenses Rs 1,295,459, profit Rs 200,076, and Rs 100,038 to each partner. |
| **AC-03** | At least two further historical months are reconciled line by line against the client’s workbooks. |
| **AC-04** | The monthly total for each party is shown to be derived from its entries, with the Best Lab cash receipts recorded as entries rather than typed into a total. |
| **AC-05** | The funding source rule is demonstrated: a partner-funded expense leaves profit unchanged, raises that partner’s investment, and still appears in the category report. |
| **AC-06** | Offline entry is demonstrated end to end — connection disabled, several entries made, browser closed and reopened, connection restored, all entries uploaded exactly once. |
| **AC-07** | Repeated upload of the same entry is shown not to create a duplicate. |
| **AC-08** | An Operator account is shown to have no route to profit, loss or investment figures, including by direct request to the server. |
| **AC-09** | The date range filter is demonstrated across a month boundary and over a custom range. |
| **AC-10** | Warnings correctly identify a missing recurring bill and a missing instalment line. |
| **AC-11** | The change history correctly reflects a representative sample of additions, edits and archivals, including one made offline. |
| **AC-12** | Restoring the database from an actual backup into a clean environment is demonstrated. |
| **AC-13** | PDF and Excel exports are verified against the underlying data. |
| **AC-14** | Both partners and at least one reception operator complete a walkthrough and confirm they can perform their routine tasks unaided. |
| **AC-15** | Repository documentation satisfies NFR-MNT-01 to NFR-MNT-04. |

| **AC-02 is the criterion that matters most**<br>July 2026 is the reference month. If the system does not produce Rs 200,076 from the same underlying data, something is wrong — either in the implementation or in this specification — and it must be found before proceeding.<br>This reconciliation should be built as an automated test early in development and kept passing, not left until acceptance. It is the single best protection against a misunderstanding in this document going unnoticed until launch. |
| --- |

# 10.  Documentation Deliverables

Alongside the working system, the following are produced and handed over. Their purpose is to make the system maintainable by an engineer who did not build it.

| **Document** | **Audience** | **Where it lives** |
| --- | --- | --- |
| **This SRS** | Client and engineers | Repository /docs and a signed client copy |
| **Architecture overview and diagram** | Engineers | /docs/architecture.md |
| **Architecture Decision Records** | Engineers | /docs/adr/ |
| **API specification** | Engineers | Generated from source |
| **Database schema and migrations** | Engineers | Version-controlled migration files |
| **Offline sync design note** | Engineers | /docs/offline-sync.md — the highest-risk area, documented separately |
| **Deployment runbook** | Engineers | /docs/deployment.md |
| **README and local setup guide** | Engineers | Repository root |
| **Environment variable reference** | Engineers | .env.example |
| **Test plan and QA checklist** | Engineers | /docs/testing.md |
| **Change log** | Both | CHANGELOG.md |
| **Change request log** | Client | Shared with the client |
| **Handover document — accounts, domain, hosting, renewal dates** | Client | Delivered separately. Passwords in a password manager, never in a document. |
| **One-page user guide** | Client | Delivered as PDF, one version for Operators and one for Partners |

# 11.  Changes from Version 2.0

Version 2.0 of this document was written before the client had answered the outstanding questions. All eighteen assumptions have now been resolved, and the following changed as a result. This section exists so that anyone who read v2.0 can see exactly what moved and why.

## 11.1  Removed

| **Removed from v2.0** | **Client answer** |
| --- | --- |
| **Month closing, locking and reopening (UC-12, UC-13, FR-SET-10 to 13)** | Declined. A date range filter is wanted instead, defaulting to the current month. Records stay editable. |
| **The accounting_periods table and period status** | Follows from the above. A month is now a query, not a stored state. |
| **Separation of capital from running costs (cost_type)** | Declined. Machine instalments count as ordinary expenses and reduce profit, as the current sheet does. |
| **Partner reimbursement and net transfer settlement (FR-SET-04, 05, 07)** | Declined. A partner is not repaid; the amount is added to his investment instead. |
| **Stored settlement figures (settlements, settlement_partner_lines)** | No longer needed once months are not closed. Results are calculated on demand. |

## 11.2  Added

| **Added in v3.0** | **Client answer** |
| --- | --- |
| **Offline entry with automatic upload (FR-OFF-01 to 14)** | Required. Entry must continue during an outage and upload accurately when the connection returns. |
| **Operator role (FR-AUTH-03, 04)** | Entry is done at reception by whoever is on duty, not by the partners. Financial results are withheld from this role. |
| **Daily counter income (FR-CINC-01 to 05)** | Wanted both daily and monthly. v2.0 assumed monthly only. |
| **Daily-billing and monthly-billing parties (FR-PINC-01 to 03)** | Some parties bill daily, most monthly. v2.0 treated all parties the same. |
| **Direct cash receipts (FR-PINC-06)** | The Best Lab difference is cash paid directly and never written on the sheet. It now has a place to be recorded. |
| **Funding source on every expense (FR-DEXP-05, FR-MEXP-05)** | Expresses the partner rule: profit counts business-paid expenses only, while partner-paid ones raise that partner’s investment. |
| **Warnings for unentered bills and instalments (FR-WARN-01 to 05)** | Requested. The system should warn. |
| **Editable monthly instalment per asset (FR-AST-03)** | Fixed monthly amount, editable in case an instalment rises or falls. No end date held. |

## 11.3  Corrected

| **Correction** | **Explanation** |
| --- | --- |
| **July 2026 is a profit of Rs 200,076, not a loss of Rs 231,305.** | The first workbook supplied was an incomplete working copy with only 5 of 27 income lines filled. The complete sheet reconciles exactly. |
| **The Best Lab difference is not an arithmetic error.** | Confirmed as cash paid directly and recorded only in the summary. The money was counted correctly; only the detail was missing. |
| **Perfect Medical Systems is not an instalment.** | Confirmed as a chemicals vendor. Ordinary purchasing expense. |
| **Duplicate AT WASTE line in the July sheet.** | Confirmed as an error. It is one fixed monthly bill, not two. |
| **The asset register starts empty.** | No equipment list exists yet. Assets will be added over time. |

# 12.  Change Control

This document is the agreed scope once signed. After signature:

- Any new or changed requirement is raised as a Change Request.

- Each Change Request records the date, what is requested, why, which requirements it affects, and the effect on time and cost.

- No Change Request is implemented until the client approves it in writing.

- Approved changes are folded into a new version of this document.

Three items are already identified as likely future Change Requests: instalment end dates and outstanding balances (FR-AST-05), asset depreciation, and an Urdu interface. Each was considered and set aside for this release.

# 13.  Sign-Off

By signing below, both parties confirm that this document represents the agreed requirements for the system. Unlike version 2.0, no requirement here rests on an unconfirmed assumption.

| **Role** | **Name** | **Signature** | **Date** |
| --- | --- | --- | --- |
| **Client Representative**<br>CDC Laboratories |  |  |  |
| **Lead Developer** | Saad Naseer |  |  |

*End of document.*

# Appendix A — Initial Data

The system will be delivered with the following already loaded, taken from the July 2026 workbook. Placeholder email addresses are used for the two partner accounts and will be replaced at handover.

## A.1  Parties (27)

Four are set to daily billing, matching the columns in the existing sheet. The remainder are monthly.

| **Daily billing** | **Monthly billing** |
| --- | --- |
| **GIVE LAB, BEST LAB, ACCURATE LAB, SHAHADAT LAB** | HUSSAIN LAB, KHADIJA LAB, FATIMA LAB, TAHIR BUTT LAB, QASIM LAB, TEHSIN LAB, MAQBOOL LAB, KASHIF LAB, DANISH LAB, RAMZAN HOS, BASEERAT LAB, AL RAI HOSP, GUJRANWALA LAB, ARQAM LAB, ANWAAR LAB, NOOR LAB, PROMAX LAB, TIMES LAB, AMINA MURAD HOSP, NAVEED LAB, SWISS PAK LAB, BHATTI LAB |

## A.2  Administration Categories (15)

Marked as recurring, so the system warns when one is not entered. Note that AT WASTE appears once, not twice as in the July sheet.

| **Category** | **July 2026 (Rs)** |
| --- | --- |
| **STAFF PAY 1** | 18,000 |
| **STAFF PAY 2** | 18,000 |
| **STAFF PAY 3** | 20,000 |
| **TECHNOLOGIST PAY 1** | 55,000 |
| **TECHNOLOGIST PAY 2** | 45,000 |
| **PATHOLOGIST PAY** | 40,000 |
| **SWEEPER PAY** | 9,000 |
| **UTILITY BILL** | 62,000 |
| **AT WASTE** | 8,000 |
| **NET CHARGES** | 3,200 |
| **SECURITY FEE** | 0 |
| **SOFTWARE CHARGES** | 3,000 |
| **CDC LAB LAHORE BILL** | 341,719 |
| **RENT LAB** | 50,000 |
| **COURIER** | 20,000 |

## A.3  Purchasing Categories and Vendors

| **Vendor** | **July 2026 (Rs)** | **Type** |
| --- | --- | --- |
| **Daily Expenses (system-generated line)** | 171,190 | Calculated |
| **REHMAN TRADERS** | 20,000 | Supplies |
| **NATIONAL DIAGNOSTICS** | 20,000 | Supplies |
| **DATA DIAGNOSTICS** | 32,000 | Supplies |
| **DATA DIAGNOSTICS INST** | 50,000 | Machine instalment |
| **LAB MEDIKAL SOL** | — | Supplies |
| **LAB MEDIKAL SOL INST** | 100,000 | Machine instalment |
| **ZYNOTIC DIAGNOSTICS** | — | Supplies |
| **ZYNOTIC DIAGNO INST** | 100,000 | Machine instalment |
| **PERFECT MEDICAL SYS** | 101,350 | Chemicals — confirmed not an instalment |

The three instalment lines become assets in the register, each with its monthly amount. The client will name the machines at setup.

## A.4  Daily Expense Items

Drawn from the July 2026 daily entries. The list is editable, and free text remains available for anything not on it.

WATER · PARCEL · STRIPS · SOAP · TISSUE · SYRINGES · ALCOHOL SWAB · CBC VIALS · CLOT VIALS · ELISA KITS · SPRAY · PETROL · COURIER · PAPER RIM · REGISTER · KEY RINGS · FLEX · ENGINEER VISIT · PRINTER REPAIR · ENTERTAINMENT · STAFF PAY · OTHER

## A.5  Users

| **Name** | **Placeholder email** | **Role** |
| --- | --- | --- |
| **Partner 1 (name at setup)** | partner1@cdclabs.example | Admin |
| **Partner 2 (name at setup)** | partner2@cdclabs.example | Partner |
| **Reception** | reception@cdclabs.example | Operator |

*Real addresses will be supplied by the client before handover. Passwords are set by each user on first sign-in through an invitation link; no password is ever chosen by the developer or written in any document.*

## A.6  Settings

| **Setting** | **Initial value** |
| --- | --- |
| **Profit split** | Partner 1: 50%  ·  Partner 2: 50% |
| **Default date range** | First to last day of the current month |
| **Currency** | PKR |
| **Time zone** | Pakistan Standard Time (UTC+5) |
