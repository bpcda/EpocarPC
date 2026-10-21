import { describe, it, expect } from "vitest";
import { admissionEvidence, annualFeeSchema, eur, memberStatusSchema } from "@/lib/association";

const base = { membership_status: "active", category: "Fondatore", card_number: 7, admission_date: "2019-05-12", membership_year: 2026, fee_status: "paid", updated_at: "2026-10-20T10:00:00Z" } as const;

describe("member_update v2 projection schema", () => {
  it("accepts v2 fields and keeps amounts as text (never float math)", () => {
    const m = memberStatusSchema.parse({ ...base, admission_status: "confirmed", admission_source: "board_resolution",
      admission_reference: "CD 2019-04", admission_decision_date: "2019-04-20", payment_iban: "IT60X0542811101000000123456",
      payment_account_holder: "EPOCAR APS", cessation_date: null, cessation_reason: null, public_message: "Benvenuto!" });
    expect(m.admission_status).toBe("confirmed");
    const fee = annualFeeSchema.parse({ membership_year: 2026, fee_status: "partial", fee_amount: 100.0, fee_paid_amount: "40.00", fee_balance: "60.00",
      last_payment_date: "2026-03-01", last_payment_amount: "40.00", last_payment_receipt_number: "R-1" });
    expect(fee.fee_amount).toBe("100"); // numeric JSON is stringified; canonical strings pass through untouched
    expect(fee.fee_paid_amount).toBe("40.00");
    expect(eur(fee.fee_paid_amount)).toBe("40,00 €");
    expect(eur(null)).toBeNull();
  });
  it("still parses pre-v14 projections without the new columns", () => {
    expect(memberStatusSchema.parse(base).admission_status).toBeUndefined();
  });
});

describe("admission evidence", () => {
  it("is confirmed by a Treasury attestation even without an online application", () => {
    const m = memberStatusSchema.parse({ ...base, admission_status: "confirmed", admission_source: "historical_register" });
    expect(admissionEvidence(null, m)).toEqual({ status: "confirmed", source: "historical_register" });
  });
  it("never treats roles, cards or an active projection as proof", () => {
    expect(admissionEvidence(null, memberStatusSchema.parse(base)).status).toBe("unknown");
    expect(admissionEvidence(null, memberStatusSchema.parse({ ...base, admission_status: "unverified" })).status).toBe("unknown");
  });
  it("exposes not_admitted explicitly", () => {
    expect(admissionEvidence(null, memberStatusSchema.parse({ ...base, admission_status: "not_admitted" })).status).toBe("not_admitted");
  });
});
