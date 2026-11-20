import { createClient } from "@supabase/supabase-js";
import { memberCard } from "./handler.ts";
import { publicKey } from "./public-key.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
// Public verification authenticates the signed QR, not a site account: deploy with verify_jwt=false.
Deno.serve(req => memberCard(req, db, publicKey));
