import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const sql = readFileSync("setup/treasury-bootstrap-v11.sql", "utf8");
const fn = readFileSync("supabase/functions/treasury-sync/index.ts", "utf8");
const list = sql.slice(sql.indexOf("FUNCTION public.treasury_sync_bootstrap_members("), sql.indexOf("-- Acknowledge import"));

describe("bootstrap existing members", () => {
  it("lists members from category roles, with board roles kept separate from technical roles", () => {
    expect(list).toMatch(/'founder' THEN 'Fondatore'/);
    expect(list).toMatch(/'ordinary' THEN 'Ordinario'/);
    expect(list).toMatch(/'president','vice_president','secretary','treasurer','councillor'/);
    expect(list).not.toMatch(/'admin'|'staff'/);
    expect(list).toMatch(/WHERE r\.category IS NOT NULL/);
  });
  it("never invents card numbers or admission dates (only the Treasury projection, else NULL)", () => {
    expect(list).toMatch(/s\.admission_date, s\.card_number/);
    expect(list).not.toMatch(/nextval|row_number|created_at::date/);
  });
  it("does not write membership_applications or user roles from the list/ack", () => {
    expect(sql).not.toMatch(/INSERT INTO public\.membership_applications|UPDATE public\.membership_applications/);
    const ack = sql.slice(sql.indexOf("treasury_sync_bootstrap_ack("), sql.indexOf("-- member_update for"));
    expect(ack).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM) public\.user_roles/);
  });
  it("is idempotent and prevents duplicates", () => {
    expect(sql).toMatch(/treasury_member_id uuid NOT NULL UNIQUE/);
    expect(sql).toMatch(/external_member_id uuid PRIMARY KEY/);
    expect(sql).toMatch(/idempotency_conflict/);
    expect(sql).toMatch(/result := 'noop'/);
  });
  it("is service-only and behind the shared-secret endpoint", () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.treasury_sync_bootstrap_members\(integer, uuid\) FROM PUBLIC, anon, authenticated/);
    expect(fn.indexOf('action === "bootstrap_members"')).toBeGreaterThan(fn.indexOf("safeEqual(token, secret)"));
    expect(fn).toMatch(/bootstrap_ack/);
  });
});
