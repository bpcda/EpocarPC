import { createClient } from "@supabase/supabase-js";
import QRCode from "qrcode";
import { manageMemberCards } from "./handler.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
// JWT identity is verified in the handler, including the single permitted account.
Deno.serve(req => manageMemberCards(req, db, text => QRCode.toString(text, { type: "svg", errorCorrectionLevel: "M", margin: 4, width: 768 })));
