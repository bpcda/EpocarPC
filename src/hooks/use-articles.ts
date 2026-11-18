import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

const articleSchema = z.object({
  id: z.string().uuid(), title: z.string(), summary: z.string().nullable(),
  content: z.string().nullable(), image_url: z.string().nullable(), created_at: z.string(),
  published_at: z.string().nullable().optional(),
});

export function useArticles(id?: string) {
  return useQuery({
    queryKey: ["articles", id ?? "published"],
    queryFn: async () => {
      if (id && !z.string().uuid().safeParse(id).success) return [];
      const { supabase } = await import("@/integrations/supabase/client");
      const load = async (withPublication: boolean) => {
        let query = supabase.from("articles")
          .select(`id, title, summary, content, image_url, created_at${withPublication ? ", published_at" : ""}`)
          .eq("published", true);
        if (withPublication) query = query.or(`published_at.is.null,published_at.lte.${new Date().toISOString()}`);
        if (id) query = query.eq("id", id);
        return query.order("created_at", { ascending: false });
      };
      let result = await load(true);
      // Legacy installations have no scheduling field, so retain their published archive.
      if (result.error?.code === "42703" || result.error?.code === "PGRST204") result = await load(false);
      if (result.error) throw result.error;
      return articleSchema.array().parse(result.data ?? []);
    },
    staleTime: 5 * 60_000,
    retry: 1,
    refetchInterval: 60_000,
  });
}
