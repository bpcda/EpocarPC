// Edge function: paginated gallery metadata with HTTP caching (ETag + Cache-Control).
// Public data — no auth required. Reduces PostgREST hits on reloads by leveraging
// the browser's HTTP cache and conditional requests (If-None-Match → 304).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, if-none-match",
  "Access-Control-Expose-Headers": "etag",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

// Cheap, stable hash → hex string. Used to build a weak ETag.
async function sha1Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-1", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const from = Math.max(0, parseInt(url.searchParams.get("from") ?? "0", 10) || 0);
    const rawTo = parseInt(url.searchParams.get("to") ?? "19", 10);
    const to = Math.max(from, Math.min(from + 199, isNaN(rawTo) ? from + 19 : rawTo));

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    const { data, error, count } = await supabase
      .from("gallery_images")
      .select("id, image_url, alt_text, sort_order, created_at", { count: "exact" })
      .order("sort_order", { ascending: true })
      .range(from, to);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = JSON.stringify({ images: data ?? [], total: count ?? 0, from, to });
    // Weak ETag: content-hash. Any insert/delete/update to the page changes it.
    const etag = `W/"${(await sha1Hex(body)).slice(0, 16)}"`;

    const ifNoneMatch = req.headers.get("if-none-match");
    if (ifNoneMatch && ifNoneMatch === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          ...corsHeaders,
          ETag: etag,
          // Same caching hints on 304 so intermediate caches keep freshness
          "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        },
      });
    }

    return new Response(body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json; charset=utf-8",
        ETag: etag,
        // Fresh for 60s, then usable for another 5min while revalidating in bg
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        Vary: "Accept-Encoding",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});