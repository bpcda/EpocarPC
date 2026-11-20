import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

const resultSchema = z.object({
  status: z.enum(["valid", "invalid", "unavailable"]),
  card_number: z.number().int().positive().optional(),
  valid_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  renewal_due: z.boolean().optional(),
  checked_at: z.string().datetime({ offset: true }).optional(),
  source_updated_at: z.string().datetime({ offset: true }).optional(),
}).refine(value => value.status !== "valid" || Boolean(value.card_number && value.valid_until && value.checked_at && value.source_updated_at && typeof value.renewal_due === "boolean"));
export type CardVerification = z.infer<typeof resultSchema>;

export async function verifyMemberCard(token: string): Promise<CardVerification> {
  if (!/^(?:v1\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[A-Za-z0-9_-]{86}|v2\.[0-9a-f]{64})$/.test(token)) return { status: "invalid" };
  try {
    const { data, error } = await supabase.functions.invoke("member-card", { body: { token } });
    if (error) return { status: "unavailable" };
    const parsed = resultSchema.safeParse(data);
    return parsed.success ? parsed.data : { status: "unavailable" };
  } catch { return { status: "unavailable" }; }
}
