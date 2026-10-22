import { describe, expect, it } from "vitest";
import { authErrorMessage } from "@/lib/auth-error";

describe("authentication error diagnostics", () => {
  it("preserves a meaningful service error", () => {
    expect(authErrorMessage(new Error("Email rate limit exceeded"))).toBe("Email rate limit exceeded");
  });
  it("extracts only safe diagnostic codes from an empty response", () => {
    const result = authErrorMessage({ message: "{}", status: 500, code: "unexpected_failure", token: "private-value" });
    expect(result).toContain("unexpected_failure · HTTP 500");
    expect(result).not.toContain("private-value");
    expect(result).not.toContain("{}");
  });
  it("handles empty objects and untrusted diagnostic fields without serialization", () => {
    expect(authErrorMessage({})).toContain("senza descrizione");
    const result = authErrorMessage({ message: "", code: "https://secret.example/token", status: 999 });
    expect(result).not.toContain("secret.example");
    expect(result).not.toContain("999");
  });
});