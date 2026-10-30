import { describe, expect, it } from "vitest";
import { isValidAdminOrigin, parseAppStage } from "./deployment";

describe("admin deployment boundary", () => {
  it("requires an explicit stage", () => {
    expect(parseAppStage(undefined)).toBeNull();
    expect(parseAppStage("prod")).toBeNull();
    expect(parseAppStage("production")).toBe("production");
  });

  it("rejects insecure or credential-bearing production origins", () => {
    expect(isValidAdminOrigin("http://admin.example.test", "production")).toBe(false);
    expect(isValidAdminOrigin("https://name:pw@admin.example.test", "production")).toBe(false);
    expect(isValidAdminOrigin("https://admin.example.test/", "production")).toBe(true);
  });
});
