import { describe, expect, it } from "vitest";
import { parsePublicSupabaseConfig } from "./public-config";

describe("public Supabase configuration", () => {
  it("accepts a publishable key on HTTPS and loopback development origins", () => {
    expect(parsePublicSupabaseConfig("https://project.supabase.co", "sb_publishable_public"))
      .toEqual({ url: "https://project.supabase.co", publishableKey: "sb_publishable_public" });
    expect(parsePublicSupabaseConfig("http://127.0.0.1:54321", "sb_publishable_local"))
      .toEqual({ url: "http://127.0.0.1:54321", publishableKey: "sb_publishable_local" });
  });

  it("rejects server keys, remote HTTP, credentials, paths and missing values", () => {
    expect(parsePublicSupabaseConfig("https://project.supabase.co", "sb_secret_private")).toBeNull();
    expect(parsePublicSupabaseConfig("http://project.supabase.co", "sb_publishable_public")).toBeNull();
    expect(parsePublicSupabaseConfig("https://user:pass@project.supabase.co", "sb_publishable_public")).toBeNull();
    expect(parsePublicSupabaseConfig("https://project.supabase.co/auth", "sb_publishable_public")).toBeNull();
    expect(parsePublicSupabaseConfig(undefined, "sb_publishable_public")).toBeNull();
  });
});
