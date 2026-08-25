import { describe, expect, it } from "vitest";
import {
  visibleNavItems,
  titleForPath,
  groupNavItems,
  NAV_SECTIONS,
} from "../../../src/lib/navigation/nav-items";

describe("visibleNavItems", () => {
  it("shows an Operator Home plus the three Phase 3B entry screens", () => {
    const hrefs = visibleNavItems("OPERATOR").map((item) => item.href);
    expect(hrefs).toEqual([
      "/home",
      "/daily-expenses",
      "/party-income",
      "/counter-income",
      "/sync-center",
      "/offline-entry",
    ]);
  });

  it("shows a Partner every Operator item plus the Phase 4/5 Partner entries and Audit Log, never Users or another Administration-only route", () => {
    const hrefs = visibleNavItems("PARTNER").map((item) => item.href);
    expect(hrefs).toEqual([
      "/home",
      "/dashboard",
      "/daily-expenses",
      "/party-income",
      "/counter-income",
      "/monthly-expenses",
      "/party-income-monthly",
      "/assets",
      "/investment",
      "/monthly-summary",
      "/party-income-report",
      "/sync-center",
      "/offline-entry",
      "/audit-log",
    ]);
    expect(hrefs).not.toContain("/users");
    expect(hrefs).not.toContain("/parties");
  });

  it("shows an Admin every current item, including every Administration route", () => {
    const hrefs = visibleNavItems("ADMIN").map((item) => item.href);
    expect(hrefs).toEqual([
      "/home",
      "/dashboard",
      "/daily-expenses",
      "/party-income",
      "/counter-income",
      "/monthly-expenses",
      "/party-income-monthly",
      "/assets",
      "/investment",
      "/monthly-summary",
      "/party-income-report",
      "/sync-center",
      "/offline-entry",
      "/users",
      "/parties",
      "/expense-items",
      "/expense-categories",
      "/vendors",
      "/profit-split",
      "/import",
      "/audit-log",
    ]);
  });

  it("never exposes a Partner/Admin-only item to Operator", () => {
    const items = visibleNavItems("OPERATOR");
    expect(items.every((item) => item.minRole === "OPERATOR")).toBe(true);
  });
});

describe("groupNavItems", () => {
  it("groups an Admin's items under every section, in NAV_SECTIONS order, with Administration last", () => {
    const groups = groupNavItems(visibleNavItems("ADMIN"));
    expect(groups.map((group) => group.section.id)).toEqual(
      NAV_SECTIONS.map((section) => section.id),
    );
    const administration = groups.find((group) => group.section.id === "administration");
    expect(administration?.items.map((item) => item.href)).toEqual([
      "/users",
      "/parties",
      "/expense-items",
      "/expense-categories",
      "/vendors",
      "/profit-split",
      "/import",
      "/audit-log",
    ]);
  });

  it("drops a section entirely when the role has nothing in it (Operator has no Administration items)", () => {
    const groups = groupNavItems(visibleNavItems("OPERATOR"));
    expect(groups.map((group) => group.section.id)).not.toContain("administration");
    expect(groups.map((group) => group.section.id)).not.toContain("monthly-operations");
    expect(groups.map((group) => group.section.id)).not.toContain("reports");
  });

  it("gives a Partner an Administration group containing only Audit Log", () => {
    const groups = groupNavItems(visibleNavItems("PARTNER"));
    const administration = groups.find((group) => group.section.id === "administration");
    expect(administration?.items.map((item) => item.href)).toEqual(["/audit-log"]);
  });
});

describe("titleForPath", () => {
  it("matches the exact route", () => {
    expect(titleForPath("/dashboard")).toBe("Dashboard");
  });

  it("matches a nested route under a nav item", () => {
    expect(titleForPath("/users/123")).toBe("Users");
  });

  it("matches the Phase 3B entry routes", () => {
    expect(titleForPath("/daily-expenses")).toBe("Daily Expenses");
    expect(titleForPath("/party-income")).toBe("Party Income");
    expect(titleForPath("/counter-income")).toBe("Counter Income");
  });

  it("matches the Phase 6 Sync Center route", () => {
    expect(titleForPath("/sync-center")).toBe("Sync Center");
  });

  it("matches the Phase 6 closure's Offline Entry Workspace route", () => {
    expect(titleForPath("/offline-entry")).toBe("Offline Entry Workspace");
  });

  it("matches the Phase 4 Partner routes", () => {
    expect(titleForPath("/monthly-expenses")).toBe("Monthly Expenses");
    expect(titleForPath("/assets")).toBe("Asset Register");
    expect(titleForPath("/investment")).toBe("Partner Investment");
    expect(titleForPath("/party-income-monthly")).toBe("Monthly Party Bills");
  });

  it("matches the Phase 5 Partner routes", () => {
    expect(titleForPath("/monthly-summary")).toBe("Monthly Summary");
    expect(titleForPath("/party-income-report")).toBe("Income by Party");
    expect(titleForPath("/audit-log")).toBe("Audit Log");
  });

  it("falls back to the product name for an unknown route", () => {
    expect(titleForPath("/something-not-in-nav")).toBe("CDC Lab Accounts System");
  });
});
