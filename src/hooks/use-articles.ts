import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

export function useArticles(id?: string) {
  return useQuery({
    queryKey: ["articles", id ?? "published"],
    queryFn: async () => {
      if (id && !z.string().uuid().safeParse(id).success) return [];
      const { supabase } = await import("@/integrations/supabase/client");
      let query = supabase.from("articles")
        .select("id, title, summary, content, image_url, created_at")
        .eq("published", true);
      if (id) query = query.eq("id", id);
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });
}
