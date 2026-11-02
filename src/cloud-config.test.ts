import { describe, it, expect } from "vitest";
import { validateCloudConfig } from "../cloud-config";
describe("公開ビルドの接続設定", () => {
  it("未設定ではローカル運用、設定時は接続先のoriginだけを許可する", () => {
    expect(validateCloudConfig({})).toBe("");
    expect(
      validateCloudConfig({
        VITE_SUPABASE_URL: "https://example.supabase.co/",
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_public",
      }),
    ).toBe("https://example.supabase.co");
  });
  it("秘密キー・片方だけの設定・不正なURLをビルド前に拒否する", () => {
    const base = {
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_bad",
    };
    expect(() => validateCloudConfig(base)).toThrow("secret");
    expect(() =>
      validateCloudConfig({
        ...base,
        VITE_SUPABASE_PUBLISHABLE_KEY: `header.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.sig`,
      }),
    ).toThrow("service_role");
    expect(() =>
      validateCloudConfig({ VITE_SUPABASE_URL: base.VITE_SUPABASE_URL }),
    ).toThrow("both");
    expect(() =>
      validateCloudConfig({ ...base, VITE_SUPABASE_URL: "http://example.com" }),
    ).toThrow("HTTPS");
  });
});
