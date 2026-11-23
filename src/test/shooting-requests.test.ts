// @vitest-environment node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { expect, it } from "vitest";

it("stores one private pending request and one receipt per accepted submission", async () => {
  const name = "epocar-shooting-" + randomUUID().slice(0, 8);
  const docker = (args: string[], input?: string) => execFileSync("docker", args, {
    input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();
  const sql = (input: string) => docker(["exec", "-i", name, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt"], input);
  const actor = randomUUID(), other = randomUUID(), key = randomUUID();
  const asUser = (id: string, query: string) => sql(`set role authenticated; set test.uid='${id}'; ${query}`);
  const submit = (retry = key, garage = "null") => `select submit_shooting_request('${retry}',greatest(current_date,date '2026-12-17')+10,${garage},'auto','Test','Auto','AB-123',true,'18:45','','v1',true,false)`;
  docker(["run", "--rm", "-d", "--network", "none", "--name", name, "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:17"]);
  try {
    let ready = false;
    for (let i = 0; i < 100 && !ready; i++) {
      try { ready = sql("select split_part(pg_read_file('postmaster.pid'),chr(10),1)='1'") === "t"; } catch { /* startup */ }
      if (!ready) await delay(150);
    }
    expect(ready).toBe(true);
    sql(`create schema auth; create role anon; create role authenticated; create role service_role bypassrls;
      create function auth.uid() returns uuid language sql as $$ select current_setting('test.uid')::uuid $$;
      grant usage on schema auth to authenticated;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
      insert into auth.users values ('${actor}','one@example.invalid',now()),('${other}','two@example.invalid',now());
      create type vehicle_type as enum ('auto','moto','vespa');
      create table vehicles(id uuid primary key default gen_random_uuid(),user_id uuid,type vehicle_type,brand text,model text,plate text);`);
    const migration = readFileSync("setup/shooting-requests-v32.sql", "utf8");
    sql(migration); sql(migration);
    expect(sql("select count(*) from shooting_evenings where accepting")).toBe("0");
    expect(() => asUser(actor, submit())).toThrow();
    sql("insert into shooting_evenings values(greatest(current_date,date '2026-12-17')+10,true,'v1','informativa test','test immagini')");
    const receipt = asUser(actor, submit());
    expect(asUser(actor, submit())).toBe(receipt);
    expect(() => asUser(actor, submit().replace("18:45", "19:00"))).toThrow();
    expect(() => asUser(actor, submit(randomUUID()))).toThrow();
    expect(sql("select count(*) from vehicles")).toBe("1");
    const vehicle = sql("select id from vehicles");
    expect(() => asUser(other, submit(randomUUID(), `'${vehicle}'`))).toThrow();
    expect(asUser(other, "select count(id) from shooting_requests")).toBe("0");
    expect(() => asUser(actor, "select plate from shooting_requests")).toThrow();
    expect(sql("select state,plate,image_permission from shooting_requests")).toBe("pending|AB123|f");
    expect(sql("select count(*) from shooting_receipt_queue")).toBe("1");
    sql(`create table profiles(user_id uuid, first_name text,last_name text);
      create function has_role(uuid,text) returns boolean language sql as $$ select $1='${other}'::uuid and $2='admin' $$;
      update shooting_evenings set accepting=false;`);
    const agenda = readFileSync("setup/shooting-agenda-v33.sql","utf8");
    sql(agenda); sql(agenda);
    expect(() => asUser(actor,"select shooting_agenda()")).toThrow();
    const admin = (query:string) => asUser(other,query);
    admin("select shooting_configure('2026-12-03',false,'Piazza Test','v1','Privacy','Immagini')");
    const migrationSlots = readFileSync("setup/shooting-slots.sql", "utf8");
    sql(migrationSlots); sql(migrationSlots);
    const generate = "select shooting_generate_slots('2026-12-03','18:00','20:00',4,20)";
    expect(() => asUser(actor, generate)).toThrow();
    expect(() => admin(generate.replace("20:00", "19:00"))).toThrow();
    admin(generate);
    expect(sql("select string_agg(starts::text || '/' || duration_minutes, ',' order by starts) from shooting_slots where day='2026-12-03'"))
      .toBe("18:00:00/20,18:20:00/20,18:40:00/20,19:00:00/20");
    expect(sql("select count(*) from shooting_slots where day='2026-12-17'")).toBe("5");
    const slot = sql("select id from shooting_slots where day='2026-12-03' order by starts limit 1");
    const move = sql("select id from shooting_slots where day='2026-12-03' order by starts offset 1 limit 1");
    const schedule = (revision:number,target:string) => admin(`select shooting_schedule('${receipt}',${revision},'${target}')`);
    schedule(0,slot);
    sql(`create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(name text,bucket_id text,created_at timestamptz default now());
      alter table storage.objects enable row level security;
      grant usage on schema storage to anon,authenticated;
      grant select on storage.objects to anon,authenticated;
      create policy unrelated_permissive_read on storage.objects for select using(true);
      create table gallery_images(id uuid primary key,image_url text not null,alt_text text,uploaded_by uuid);`);
    const photos = readFileSync("setup/shooting-photos.sql","utf8");
    sql(photos); sql(photos);
    const optIn = submit(randomUUID()).replace("submit_shooting_request","submit_shooting_photo_request")
      .replace("AB-123","PHOTO123").replace("true,false)", "true,false,true)");
    const consent = sql(`begin; update shooting_evenings set meeting_place='Piazza',accepting=true
      where day=(select day from shooting_requests where id='${receipt}');
      set local role authenticated; set local test.uid='${actor}';
      ${optIn}; ${optIn}; reset role;
      select count(*) from shooting_requests where plate='PHOTO123' and gallery_permission; rollback;`).split("\n");
    expect(consent[0]).toBe(consent[1]);
    expect(consent[2]).toBe("1");
    const privatePhoto = randomUUID(), sharedPhoto = randomUUID();
    sql(`insert into storage.objects(name,bucket_id) values ('${privatePhoto}.jpg','shooting-photos'),('${sharedPhoto}.jpg','shooting-photos')`);
    const deliver = (id:string) => `select shooting_deliver_photo('${id}','${slot}',array['${receipt}'::uuid])`;
    const publish = (id:string,verified:boolean) => `select shooting_publish_photo('${id}',true,${verified})`;
    expect(() => asUser(actor,deliver(privatePhoto))).toThrow();
    admin(deliver(privatePhoto)); admin(deliver(privatePhoto));
    expect(asUser(actor,"select count(*) from storage.objects")).toBe("0");
    expect(asUser(actor,"select id from my_shooting_photos()")).toBe(privatePhoto);
    expect(admin("select count(*) from my_shooting_photos()")).toBe("0");
    expect(() => admin(publish(privatePhoto,true))).toThrow();
    expect(() => asUser(actor,submit().replace("submit_shooting_request","submit_shooting_photo_request").replace("true,false)", "true,false,true)"))).toThrow();
    sql(`update shooting_requests set gallery_permission=true where id='${receipt}'`);
    admin(deliver(sharedPhoto));
    const groupMember = randomUUID(), groupPhoto = randomUUID();
    expect(sql(`begin;
      insert into storage.objects(name,bucket_id) values ('${groupPhoto}.jpg','shooting-photos');
      insert into shooting_requests(id,actor,retry_key,fingerprint,day,kind,brand,model,plate,notes,email,
        policy_version,privacy_text,image_text,image_permission,state,slot_id)
      select '${groupMember}','${other}',gen_random_uuid(),'group',day,kind,brand,model,'GROUP',notes,email,
        policy_version,privacy_text,image_text,true,'confirmed',slot_id from shooting_requests where id='${receipt}';
      set local role authenticated; set local test.uid='${other}';
      select shooting_deliver_photo('${groupPhoto}','${slot}',array['${receipt}'::uuid,'${groupMember}'::uuid]);
      select count(*) from my_shooting_photos('${groupPhoto}');
      set local test.uid='${actor}'; select count(*) from my_shooting_photos('${groupPhoto}');
      reset role; select eligible from shooting_photos where id='${groupPhoto}';
      rollback;`)).toBe("1\n1\nf");
    expect(() => admin(publish(sharedPhoto,false))).toThrow();
    admin(publish(sharedPhoto,true)); admin(publish(sharedPhoto,true));
    sql("update shooting_photos set expires_at=now()-interval '1 second'");
    expect(asUser(actor,"select count(*) from my_shooting_photos()")).toBe("0");
    expect(sql("select count(*) from gallery_images")).toBe("1");
    admin(`select shooting_publish_photo('${sharedPhoto}',false,false)`);
    expect(sql("select count(*) from gallery_images")).toBe("0");
    sql(`create schema cron; create schema net;
      create table cron.jobs(name text primary key,command text);
      create function cron.schedule(text,text,text) returns void language sql as 'insert into cron.jobs values($1,$3) on conflict(name) do update set command=excluded.command';
      create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as 'select 1::bigint';`);
    const cleanup = readFileSync("setup/shooting-photos-cleanup.sql","utf8").replace(/^create extension .*;$/gm,"");
    sql(cleanup); sql(cleanup);
    expect(sql(sql("select command from cron.jobs"))).toBe("1");
    sql("update storage.objects set created_at=now()-interval '31 days'");
    expect(()=>asUser(actor,`select * from shooting_photo_cleanup_batch('${randomUUID()}')`)).toThrow();
    expect(()=>sql(`select * from shooting_photo_cleanup_batch('${randomUUID()}')`)).toThrow();
    expect(sql("select count(*) from shooting_photo_cleanup_batch((select secret from shooting_photo_cleanup_key))")).toBe("2");
    const calendar = readFileSync("setup/shooting-calendar.sql", "utf8");
    sql(calendar); sql(calendar);
    const event = sql("select id from shooting_calendar_events");
    expect(admin("select shooting_calendar_status()")).toBe("1");
    expect(() => asUser(actor,"select shooting_calendar_status()")).toThrow();
    expect(() => admin("select * from shooting_calendar_claim('test')")).toThrow();
    expect(sql("select count(*) from shooting_calendar_claim('test')")).toBe("1");
    expect(sql("select count(*) from shooting_calendar_claim('test')")).toBe("0");
    expect(sql("select starts_at at time zone 'UTC' from shooting_calendar_events")).toBe("2026-12-03 17:00:00");
    expect(() => admin(generate.replace("18:00", "18:10"))).toThrow();
    expect(() => admin(generate.replace(",20)", ",15)"))).toThrow();
    admin(generate.replace(",4,20)", ",5,20)"));
    expect(sql(`select slot_id from shooting_requests where id='${receipt}'`)).toBe(slot);
    expect(() => schedule(0,move)).toThrow();
    expect(() => admin(`select shooting_capacity('${slot}',0)`)).toThrow();
    schedule(1,move);
    expect(sql(`select slot_id from shooting_calendar_events where id='${event}'`)).toBe(move);
    // A completion for the earlier revision cannot acknowledge the move.
    sql("update shooting_calendar_events set applied_revision=1,lease=null,lease_until=null");
    expect(admin("select shooting_calendar_status()")).toBe("1");
    expect(sql(`begin;
      insert into shooting_requests(actor,retry_key,fingerprint,day,kind,brand,model,plate,notes,email,
        policy_version,privacy_text,image_text,image_permission,state,slot_id)
      select actor,gen_random_uuid(),'test',day,kind,brand,model,'OTHER',notes,email,
        policy_version,privacy_text,image_text,image_permission,'confirmed',slot_id from shooting_requests;
      select count(*) from shooting_calendar_events;
      update shooting_requests set slot_id='${slot}' where plate='OTHER';
      select count(*) from shooting_calendar_events where slot_id is not null;
      update shooting_requests set slot_id='${move}' where plate='OTHER';
      select count(*) from shooting_calendar_events where slot_id is not null;
      rollback;`)).toBe("1\n2\n1");
    expect(admin(`select shooting_plate('${receipt}')`)).toBe("AB123");
    expect(sql("select count(*) from shooting_plate_access")).toBe("1");
    admin("select shooting_rain('2026-12-03')");
    admin("select shooting_rain('2026-12-03')");
    expect(sql("select state from shooting_requests")).toBe("cancelled");
    expect(sql(`select slot_id is null from shooting_calendar_events where id='${event}'`)).toBe("t");
    expect(sql("select string_agg(kind,',' order by revision) from shooting_messages")).toBe("receipt,confirmed,moved,rain");
    expect(sql("select count(*) from shooting_messages where delivery_state='pending'")).toBe("1");
  } finally {
    docker(["rm", "-f", name]);
  }
}, 120000);
