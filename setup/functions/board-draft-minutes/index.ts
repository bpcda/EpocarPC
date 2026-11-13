import { handleBoardAi } from "../_shared/board-ai.ts";
Deno.serve((request) => handleBoardAi(request, "draft", { env: (key) => Deno.env.get(key) }));
