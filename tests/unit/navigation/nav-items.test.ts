import { describe, expect, it } from "vitest";
import { visibleNavItems, titleForPath } from "../../../src/lib/navigation/nav-items";

describe("visibleNavItems", () => {
  it("shows an Operator Home plus the three Phase 3B entry screens", () => {
    const hrefs = visibleNavItems("OPERATOR").map((item) => item.href);
    expect(hrefs).toEqual(["/home", "/daily-expenses", "/party-income", "/counter-income"]);
  });

  it("shows a Partner every Operator item plus Dashboard, never Users", () => {
    const hrefs = visibleNavItems("PARTNER").map((item) => item.href);
    expect(hrefs).toEqual([
      "/home",
      "/daily-expenses",
      "/party-income",
      "/counter-income",
      "/dashboard",
    ]);
    expect(hrefs).not.toContain("/users");
  });

  it("shows an Admin every current item", () => {
    const hrefs = visibleNavItems("ADMIN").map((item) => item.href);
    expect(hrefs).toEqual([
      "/home",
      "/daily-expenses",
      "/party-income",
      "/counter-income",
      "/dashboard",
      "/users",
    ]);
  });

  it("never exposes a Partner/Admin-only item to Operator", () => {
    const items = visibleNavItems("OPERATOR");
    expect(items.every((item) => item.minRole === "OPERATOR")).toBe(true);
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

  it("falls back to the product name for an unknown route", () => {
    expect(titleForPath("/something-not-in-nav")).toBe("CDC Lab Accounts System");
  });
});
