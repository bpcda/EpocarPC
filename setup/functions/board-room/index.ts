import { boardRoom } from "./handler.ts";
Deno.serve((req) => boardRoom(req, (key) => Deno.env.get(key)));
