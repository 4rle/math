export function validateCloudConfig(values: Record<string, string>) {
  const url = values.VITE_SUPABASE_URL,
    key = values.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url && !key) return "";
  if (!url || !key)
    throw new Error(
      "Set both VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  const parsed = new URL(url);
  if (
    (parsed.protocol !== "https:" &&
      !(
        ["localhost", "127.0.0.1"].includes(parsed.hostname) &&
        parsed.protocol === "http:"
      )) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    !["", "/"].includes(parsed.pathname)
  )
    throw new Error(
      "Supabase URL must be an HTTPS origin (HTTP is allowed only on localhost).",
    );
  if (key.startsWith("sb_secret_"))
    throw new Error(
      "A secret key must never be bundled in the browser. Use the publishable key.",
    );
  if (key.split(".").length === 3) {
    let role: string;
    try {
      role = JSON.parse(
        Buffer.from(key.split(".")[1], "base64url").toString(),
      ).role;
    } catch {
      throw new Error("Invalid public API key.");
    }
    if (role !== "anon")
      throw new Error(
        "Only the legacy anon key is allowed; never use service_role.",
      );
  }
  return parsed.origin;
}
