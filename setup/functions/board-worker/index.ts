import { boardWorker } from "./handler.ts";
Deno.serve((req) => boardWorker(req, (key) => Deno.env.get(key)));
