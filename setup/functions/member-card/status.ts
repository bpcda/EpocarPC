import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const parsed = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === v;
});
export const cardMemberSchema = z.object({
  admission_status: z.enum(["confirmed", "unverified", "not_admitted"]).nullable(),
  admission_source: z.enum(["board_resolution", "historical_register"]).nullable(),
  admission_date: date.nullable(),
  admission_decision_date: date.nullable(),
  membership_status: z.enum(["active", "suspended", "ceased"]),
  card_number: z.number().int().positive(),
  treasury_updated_at: z.string().datetime({ offset: true }),
  last_revision: z.number().int().positive(),
});
export const cardFeeSchema = z.object({
  membership_year: z.number().int().min(2000).max(2100),
  fee_status: z.enum(["paid", "partial", "due", "exempt"]).nullable(),
  last_payment_date: date.nullable(),
});
export type CardResult = { status: "valid" | "invalid" | "unavailable"; valid_until?: string; renewal_due?: boolean };

export function cardStatus(member: z.infer<typeof cardMemberSchema>, fees: z.infer<typeof cardFeeSchema>[], now: Date): CardResult {
  if (member.membership_status !== "active" || member.admission_status === "not_admitted") return { status: "invalid" };
  if (member.admission_status !== "confirmed" || !member.admission_source) return { status: "unavailable" };
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(now);
  const year = Number(today.slice(0, 4));
  const admission = member.admission_decision_date ?? member.admission_date;
  if (!admission || admission > today || Date.parse(member.treasury_updated_at) > now.getTime() + 300000) return { status: "unavailable" };
  const februaryEnd = (y: number) => `${y}-02-${new Date(Date.UTC(y, 2, 0)).getUTCDate()}`;
  const admissionYear = Number(admission.slice(0, 4));
  const lapsed = fees.some(fee => {
    if (fee.membership_year < admissionYear || fee.membership_year >= year) return false;
    const deadline = februaryEnd(fee.membership_year === admissionYear ? fee.membership_year + 1 : fee.membership_year);
    return today > deadline && (fee.fee_status === "due" || fee.fee_status === "partial"
      || fee.fee_status === "paid" && Boolean(fee.last_payment_date && fee.last_payment_date > deadline));
  });
  if (lapsed) return { status: "invalid" };
  const paid = (fee: z.infer<typeof cardFeeSchema> | undefined) => {
    if (fee?.fee_status === "exempt") return true;
    if (fee?.fee_status !== "paid" || !fee.last_payment_date || fee.last_payment_date > today) return false;
    // A late renewal does not readmit a lapsed member; a new recorded admission can.
    return fee.last_payment_date <= februaryEnd(fee.membership_year) || admission > februaryEnd(fee.membership_year);
  };
  const current = fees.find(f => f.membership_year === year);
  if (current?.last_payment_date && current.last_payment_date > today) return { status: "unavailable" };
  if (paid(current)) return { status: "valid", valid_until: februaryEnd(year + 1), renewal_due: false };
  if (today <= februaryEnd(year) && paid(fees.find(f => f.membership_year === year - 1))) {
    return { status: "valid", valid_until: februaryEnd(year), renewal_due: true };
  }
  if (!current?.fee_status || current.fee_status === "paid" && !current.last_payment_date) return { status: "unavailable" };
  return { status: "invalid" };
}
