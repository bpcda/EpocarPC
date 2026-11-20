import { createClient } from "@supabase/supabase-js";
import { memberWallet } from "./handler.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
Deno.serve(req => memberWallet(req, db));
