import { describe, expect, it } from "vitest";
import { parseGuestConfigEnvironment } from "./deployment";

describe("guest deployment environment", () => {
  it("requires an explicit staging or production registry", () => {
    expect(parseGuestConfigEnvironment(undefined)).toBeNull();
    expect(parseGuestConfigEnvironment("local")).toBeNull();
    expect(parseGuestConfigEnvironment("staging")).toBe("staging");
    expect(parseGuestConfigEnvironment("production")).toBe("production");
  });
});
