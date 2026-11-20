import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyMemberCard } from "@/lib/member-card";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));
const token = `v1.00000000-0000-4000-8000-000000000001.${"a".repeat(86)}`;
beforeEach(() => vi.clearAllMocks());

describe("member card client boundary", () => {
  it("rejects malformed QR contents without calling the service", async () => {
    expect(await verifyMemberCard("bad")).toEqual({ status: "invalid" });
    expect(invoke).not.toHaveBeenCalled();
  });
  it("requires a complete validity response rather than trusting a bare valid flag", async () => {
    invoke.mockResolvedValueOnce({ data: { status: "valid" }, error: null });
    expect(await verifyMemberCard(token)).toEqual({ status: "unavailable" });
    const result = { status: "valid", card_number: 12, valid_until: "2027-02-28", renewal_due: false, checked_at: "2026-11-20T10:00:00Z", source_updated_at: "2026-11-18T10:00:00Z" };
    invoke.mockResolvedValueOnce({ data: result, error: null });
    expect(await verifyMemberCard(token)).toEqual(result);
    expect(invoke).toHaveBeenLastCalledWith("member-card", { body: { token } });
  });
  it("fails closed on network, service and malformed responses without exposing backend errors", async () => {
    invoke.mockRejectedValueOnce(new Error("private-details"));
    expect(await verifyMemberCard(token)).toEqual({ status: "unavailable" });
    invoke.mockResolvedValueOnce({ data: null, error: { private: "details" } });
    expect(await verifyMemberCard(token)).toEqual({ status: "unavailable" });
    invoke.mockResolvedValueOnce({ data: { status: "maybe" }, error: null });
    expect(await verifyMemberCard(token)).toEqual({ status: "unavailable" });
  });
  it("accepts automatic QR credentials without changing the verification flow", async () => {
    invoke.mockResolvedValueOnce({ data: { status: "invalid" }, error: null });
    const automatic = "v2." + "b".repeat(64);
    expect(await verifyMemberCard(automatic)).toEqual({ status: "invalid" });
    expect(invoke).toHaveBeenCalledWith("member-card", { body: { token: automatic } });
  });
});
