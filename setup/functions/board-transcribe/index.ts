import { handleBoardAi } from "../_shared/board-ai.ts";
Deno.serve((request) => handleBoardAi(request, "transcribe", { env: (key) => Deno.env.get(key) }));
