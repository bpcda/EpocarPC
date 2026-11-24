import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface MemberBenefit {
  id: string;
  business: string;
  benefit: string;
  conditions: string;
  redemption: string;
  published: boolean;
  revision: number;
}
export const benefitsTable = () => (supabase as SupabaseClient).from("member_benefits");
export function useBenefits(owner?: string) {
  return useQuery({
    queryKey: ["member-benefits", owner ?? "public"],
    gcTime: owner ? 0 : undefined,
    queryFn: async () => {
      let query = benefitsTable().select("id,business,benefit,conditions,redemption,published,revision").order("business").order("id");
      if (!owner) query = query.eq("published", true);
      const { data, error } = await query;
      if (!owner && error?.code === "PGRST205") return [] as MemberBenefit[];
      if (error) throw error;
      return data as MemberBenefit[];
    },
  });
}
