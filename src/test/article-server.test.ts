// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import handler from "../../api/article.js";

const id = "11111111-1111-4111-8111-111111111111";
const row = { id, title: "Un giro in città", summary: "Un incontro", content: "<p>Ci vediamo</p><script>alert(1)</script>", image_url: null };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function response() {
  return {
    code: 0, headers: {} as Record<string,string>, body: "",
    status(code:number) { this.code=code; return this; },
    setHeader(key:string,value:string) { this.headers[key]=value; return this; },
    end(body="") { this.body=body; return this; },
    send(body:string) { this.body=body; return this; },
  };
}
it("serves searchable article HTML, redirects old URLs and rejects unpublished articles", async () => {
  vi.stubEnv("VITE_SUPABASE_URL","https://fixture.invalid");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY","public");
  const fetcher = vi.fn().mockResolvedValue({ok:true,json:async()=>[row]});
  vi.stubGlobal("fetch",fetcher);
  const old = response();
  await handler({query:{segment:id}},old);
  expect(old.code).toBe(301);
  expect(old.headers.Location).toBe("/articoli/un-giro-in-citta--"+id);
  const current=response();
  await handler({query:{segment:"un-giro-in-citta--"+id}},current);
  expect(current.code).toBe(200);
  expect(current.body).toContain("<h1>Un giro in città</h1>");
  expect(current.body).toContain("<p>Ci vediamo</p>");
  expect(current.body).not.toContain("alert(1)");
  expect(current.body).toContain('rel="canonical" href="https://epocarpc.com/articoli/un-giro-in-citta--'+id+'"');
  expect(fetcher.mock.calls[0][0].searchParams.get("published")).toBe("eq.true");
  fetcher.mockResolvedValueOnce({ok:true,json:async()=>[]});
  const missing=response();
  await handler({query:{segment:id}},missing);
  expect(missing.code).toBe(404);
});
