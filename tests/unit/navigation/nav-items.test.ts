import { describe, expect, it } from "vitest";
import { visibleNavItems, titleForPath } from "../../../src/lib/navigation/nav-items";

describe("visibleNavItems", () => {
  it("shows an Operator only Home", () => {
    const hrefs = visibleNavItems("OPERATOR").map((item) => item.href);
    expect(hrefs).toEqual(["/home"]);
  });

  it("shows a Partner Home and Dashboard, never Users", () => {
    const hrefs = visibleNavItems("PARTNER").map((item) => item.href);
    expect(hrefs).toEqual(["/home", "/dashboard"]);
    expect(hrefs).not.toContain("/users");
  });

  it("shows an Admin every current item", () => {
    const hrefs = visibleNavItems("ADMIN").map((item) => item.href);
    expect(hrefs).toEqual(["/home", "/dashboard", "/users"]);
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

  it("falls back to the product name for an unknown route", () => {
    expect(titleForPath("/something-not-in-nav")).toBe("CDC Lab Accounts System");
  });
});
