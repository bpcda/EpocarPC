// @vitest-environment node
// Isolated PostgreSQL with synthetic data; no production connection or host port.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

describe("News publication on isolated PostgreSQL", () => {
  it("sets first-publication dates and enforces scheduling for public readers without changing editorial permissions", async () => {
    const name = `epocar-news-test-${randomUUID().slice(0, 8)}`;
    const docker = (args: string[], input?: string) => execFileSync("docker", args, { encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"] }).trim();
    const sql = (query: string) => docker(["exec", "-i", name, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt"], query);
    const admin = "00000000-0000-4000-8000-000000000001";
    const staff = "00000000-0000-4000-8000-000000000002";
    const member = "00000000-0000-4000-8000-000000000003";
    const as = (uid: string | null, query: string) => sql(`SET ROLE ${uid ? "authenticated" : "anon"}; SET test.uid = '${uid ?? ""}'; ${query}`);
    let started = false;
    try {
      docker(["run", "--rm", "--detach", "--name", name, "--network", "none", "--tmpfs", "/var/lib/postgresql/data", "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:16-alpine"]);
      started = true;
      for (let attempt = 0; ; attempt++) {
        try { docker(["exec", name, "pg_isready", "-U", "postgres"]); break; }
        catch { if (attempt >= 50) throw new Error("Isolated PostgreSQL did not start"); await new Promise(resolve => setTimeout(resolve, 200)); }
      }
      sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
        CREATE TYPE public.app_role AS ENUM ('admin','staff','member');
        CREATE TABLE public.user_roles(user_id uuid, role public.app_role);
        INSERT INTO public.user_roles VALUES ('${admin}','admin'),('${staff}','staff'),('${member}','member');
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
        CREATE FUNCTION public.has_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=$1 AND role=$2) $$;
        GRANT USAGE ON SCHEMA auth TO anon,authenticated;
        CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;`);
      sql(readFileSync("supabase/migrations/20260309224149_183548ed-1f32-4856-95a9-b3d88ee3c024.sql", "utf8"));
      sql(`GRANT SELECT,INSERT,UPDATE,DELETE ON public.articles TO anon,authenticated;
        CREATE POLICY "Staff can view all articles" ON public.articles FOR SELECT USING (public.has_role(auth.uid(),'staff'));
        INSERT INTO public.articles(title,published,created_at,updated_at) VALUES ('Legacy',true,'2020-01-01T09:00Z','2021-01-01T09:00Z');`);
      const migration = readFileSync("setup/articles-publication-v29.sql", "utf8");
      sql(migration); sql(migration);
      expect(sql("SELECT created_at='2020-01-01T09:00Z' AND updated_at='2021-01-01T09:00Z' AND published_at IS NULL FROM public.articles WHERE title='Legacy'" )).toBe("t");
      expect(as(admin, "INSERT INTO public.articles(title,published,created_at) VALUES ('Automatic',true,'2020-01-01') RETURNING published_at>=now()-interval '1 second'" )).toBe("t");
      const draft = as(admin, "INSERT INTO public.articles(title,published,created_at) VALUES ('Draft',false,'2020-01-01') RETURNING id");
      expect(sql(`SELECT published_at IS NULL FROM public.articles WHERE id='${draft}'`)).toBe("t");
      as(admin, `UPDATE public.articles SET published=true WHERE id='${draft}'`);
      expect(sql(`SELECT published_at > created_at FROM public.articles WHERE id='${draft}'`)).toBe("t");
      as(admin, `UPDATE public.articles SET published=false WHERE id='${draft}'`);
      const scheduled = as(admin, "INSERT INTO public.articles(title,published,published_at) VALUES ('Scheduled',true,now()+interval '1 day') RETURNING id");
      as(admin, "INSERT INTO public.articles(title,published,published_at) VALUES ('Backdated',true,'2020-11-09T23:00Z')");
      expect(as(null, "SELECT string_agg(title,',' ORDER BY title) FROM public.articles")).toBe("Automatic,Backdated,Legacy");
      expect(as(member, `SELECT count(*) FROM public.articles WHERE id='${scheduled}'`)).toBe("0");
      expect(as(staff, "SELECT count(*) FROM public.articles")).toBe("5");
      expect(as(admin, "SELECT count(*) FROM public.articles")).toBe("5");
      expect(() => as(staff, "INSERT INTO public.articles(title,published) VALUES ('Forbidden',true)")).toThrow();
      expect(() => as(member, "INSERT INTO public.articles(title,published) VALUES ('Forbidden',true)")).toThrow();
      expect(as(staff, `DELETE FROM public.articles WHERE id='${scheduled}' RETURNING id`)).toBe("");
      // Even an unrelated permissive policy cannot expose drafts or scheduled stories.
      sql("CREATE POLICY overly_broad_read ON public.articles FOR SELECT USING (true)");
      expect(as(null, "SELECT count(*) FROM public.articles")).toBe("3");
      expect(as(member, "SELECT count(*) FROM public.articles")).toBe("3");
      as(admin, `UPDATE public.articles SET published_at=NULL WHERE id='${scheduled}'`);
      expect(as(null, `SELECT published FROM public.articles WHERE id='${scheduled}'`)).toBe("t");
      as(admin, "UPDATE public.articles SET title='Legacy updated' WHERE title='Legacy'");
      expect(sql("SELECT published_at=created_at FROM public.articles WHERE title='Legacy updated'" )).toBe("t");
    } finally {
      if (started) docker(["rm", "--force", name]);
    }
  }, 60_000);
});
