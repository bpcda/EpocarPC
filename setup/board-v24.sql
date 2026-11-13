-- Allegati delle delibere: file privati, vincolati alla bozza e conservati nel fascicolo. Dopo v23.
BEGIN;
ALTER TABLE public.board_deliberation_documents ADD COLUMN IF NOT EXISTS pending_path text;
ALTER TABLE public.board_deliberation_documents ADD COLUMN IF NOT EXISTS storage_path text;
ALTER TABLE public.board_deliberation_documents ADD COLUMN IF NOT EXISTS sha256 text CHECK (sha256 ~ '^[0-9a-f]{64}$');
ALTER TABLE public.board_deliberation_documents ADD COLUMN IF NOT EXISTS size_bytes bigint CHECK (size_bytes BETWEEN 1 AND 10485760);
ALTER TABLE public.board_deliberation_documents ADD COLUMN IF NOT EXISTS mime_type text;
ALTER TABLE public.board_deliberation_documents ADD COLUMN IF NOT EXISTS uploaded_at timestamptz;

CREATE OR REPLACE FUNCTION public.board_document_upload_prepare(_document uuid,_extension text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _d public.board_deliberations; _f public.board_deliberation_documents; _path text;
BEGIN
  PERFORM 1 FROM public.board_meetings WHERE id=(SELECT d.meeting_id FROM public.board_deliberations d JOIN public.board_deliberation_documents f ON f.deliberation_id=d.id WHERE f.id=_document) FOR UPDATE;
  SELECT * INTO _f FROM public.board_deliberation_documents WHERE id=_document FOR UPDATE;
  SELECT * INTO _d FROM public.board_deliberations WHERE id=_f.deliberation_id;
  IF _d.id IS NULL OR _d.status<>'BOZZA' OR NOT (public.board_is_chair(_d.meeting_id) OR public.board_is_minute_taker(_d.meeting_id)) THEN RAISE EXCEPTION 'solo Presidente o verbalizzante, sulla bozza'; END IF;
  IF _f.storage_path IS NOT NULL THEN RAISE EXCEPTION 'file già registrato: aggiungere un nuovo allegato'; END IF;
  IF EXISTS (SELECT 1 FROM public.board_deliberation_conflicts c JOIN public.board_meeting_participants p ON p.id=c.participant_id WHERE c.deliberation_id=_d.id AND p.user_id=auth.uid()) THEN RAISE EXCEPTION 'conflitto di interessi sul punto'; END IF;
  IF _extension IS NULL OR _extension NOT IN ('pdf','png','jpg','jpeg','txt','docx','xlsx') THEN RAISE EXCEPTION 'formato allegato non supportato'; END IF;
  _path:=_d.meeting_id::text||'/allegato-'||_f.id::text||'-'||gen_random_uuid()::text||'.'||_extension;
  UPDATE public.board_deliberation_documents SET pending_path=_path WHERE id=_document;
  RETURN _path;
END $$;

CREATE OR REPLACE FUNCTION public.board_document_attach(_document uuid,_path text,_sha256 text,_size bigint,_mime text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _f public.board_deliberation_documents; _d public.board_deliberations; _expected text;
BEGIN
  PERFORM 1 FROM public.board_meetings WHERE id=(SELECT d.meeting_id FROM public.board_deliberations d JOIN public.board_deliberation_documents f ON f.deliberation_id=d.id WHERE f.id=_document) FOR UPDATE;
  SELECT * INTO _f FROM public.board_deliberation_documents WHERE id=_document FOR UPDATE;
  SELECT * INTO _d FROM public.board_deliberations WHERE id=_f.deliberation_id;
  IF _d.status IS DISTINCT FROM 'BOZZA' OR NOT (public.board_is_chair(_d.meeting_id) OR public.board_is_minute_taker(_d.meeting_id)) THEN RAISE EXCEPTION 'allegato non modificabile'; END IF;
  IF _path IS NULL OR _path IS DISTINCT FROM _f.pending_path OR NOT public.board_document_writable(_path) THEN RAISE EXCEPTION 'percorso non autorizzato'; END IF;
  IF _sha256 IS NULL OR _sha256 !~ '^[0-9a-f]{64}$' OR _size IS NULL OR _size NOT BETWEEN 1 AND 10485760 THEN RAISE EXCEPTION 'impronta o dimensione non valida'; END IF;
  _expected:=CASE lower(split_part(_path,'.',2)) WHEN 'pdf' THEN 'application/pdf' WHEN 'png' THEN 'image/png' WHEN 'jpg' THEN 'image/jpeg' WHEN 'jpeg' THEN 'image/jpeg' WHEN 'txt' THEN 'text/plain' WHEN 'docx' THEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' WHEN 'xlsx' THEN 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' END;
  IF _mime IS DISTINCT FROM _expected THEN RAISE EXCEPTION 'tipo del file non valido'; END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='board-documents' AND name=_path AND (metadata->>'size')::bigint=_size) THEN RAISE EXCEPTION 'file caricato assente o dimensione diversa'; END IF;
  UPDATE public.board_deliberation_documents SET storage_path=_path,sha256=_sha256,size_bytes=_size,mime_type=_mime,uploaded_at=now(),pending_path=NULL WHERE id=_document;
  INSERT INTO public.board_meeting_events(meeting_id,actor,action,detail) VALUES (_d.meeting_id,auth.uid(),'document_attached',jsonb_build_object('document_id',_document,'path',_path,'sha256',_sha256,'bytes',_size));
END $$;

CREATE OR REPLACE FUNCTION public.board_document_writable(_path text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE _m public.board_meetings;
BEGIN
  SELECT * INTO _m FROM public.board_meetings WHERE id::text=split_part(_path,'/',1) FOR UPDATE;
  IF _m.id IS NULL OR _m.status IN ('ESPORTATO','ARCHIVIATO') OR NOT (public.board_is_chair(_m.id) OR public.board_is_minute_taker(_m.id)) THEN RETURN false; END IF;
  IF _path ~ ('^'||_m.id::text||'/verbale_firmato-[0-9a-f-]{36}\.(pdf|jpg|jpeg|png)$') THEN RETURN true; END IF;
  RETURN EXISTS (SELECT 1 FROM public.board_deliberation_documents f JOIN public.board_deliberations d ON d.id=f.deliberation_id
    WHERE f.pending_path=_path AND d.meeting_id=_m.id AND d.status='BOZZA'
    AND NOT EXISTS (SELECT 1 FROM public.board_deliberation_conflicts c JOIN public.board_meeting_participants p ON p.id=c.participant_id WHERE c.deliberation_id=d.id AND p.user_id=auth.uid()));
END $$;
-- Il browser non rimuove né sostituisce file già collegati agli atti.
DROP POLICY IF EXISTS board_documents_remove ON storage.objects;
CREATE POLICY board_documents_remove ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id='board-documents' AND public.board_document_writable(name)
  AND NOT EXISTS (SELECT 1 FROM public.board_minutes WHERE signed_path=name)
  AND NOT EXISTS (SELECT 1 FROM public.board_meeting_events e WHERE e.meeting_id::text=split_part(name,'/',1) AND e.action='minutes_signed' AND (e.detail->>'path'=name OR e.detail->>'previous_path'=name))
  AND NOT EXISTS (SELECT 1 FROM public.board_deliberation_documents WHERE storage_path=name)
  AND NOT EXISTS (SELECT 1 FROM public.board_dossiers WHERE snapshot::jsonb->'minutes'->>'signed_path'=name));
REVOKE ALL ON FUNCTION public.board_document_upload_prepare(uuid,text),public.board_document_attach(uuid,text,text,bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.board_document_upload_prepare(uuid,text),public.board_document_attach(uuid,text,text,bigint,text) TO authenticated;

ALTER TABLE public.board_ballots ADD COLUMN IF NOT EXISTS documents jsonb NOT NULL DEFAULT '[]';
CREATE OR REPLACE FUNCTION public.board_deliberation_save(_meeting uuid, _id uuid, _payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _m public.board_meetings; _d public.board_deliberations; _v public.board_deliberation_versions;
        _title text; _body text; _item uuid; _n int; _ver int; _doc jsonb; _hash text; _did uuid;
BEGIN
  PERFORM 1 FROM public.board_meetings WHERE id = _meeting FOR UPDATE;
  IF NOT (public.board_is_chair(_meeting) OR public.board_is_minute_taker(_meeting)) THEN
    RAISE EXCEPTION 'solo il Presidente o il verbalizzante possono scrivere la delibera'; END IF;
  SELECT * INTO _m FROM public.board_meetings WHERE id = _meeting FOR UPDATE;
  IF _m.id IS NULL THEN RAISE EXCEPTION 'riunione inesistente'; END IF;
  IF _m.started_at IS NULL OR _m.ended_at IS NOT NULL OR _m.status NOT IN ('IN_CORSO','SOSPESO') THEN
    RAISE EXCEPTION 'le delibere si scrivono durante la seduta'; END IF;
  _title := trim(COALESCE(_payload->>'title','')); _body := trim(COALESCE(_payload->>'body',''));
  IF length(_title) = 0 THEN RAISE EXCEPTION 'titolo della delibera obbligatorio'; END IF;
  IF length(_title) > 300 THEN RAISE EXCEPTION 'titolo troppo lungo'; END IF;
  IF length(_body) = 0 THEN RAISE EXCEPTION 'testo della delibera obbligatorio'; END IF;
  IF length(_body) > 20000 THEN RAISE EXCEPTION 'testo della delibera troppo lungo'; END IF;
  _item := NULLIF(_payload->>'agenda_item_id','')::uuid;
  IF _item IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.board_agenda_items WHERE id = _item AND meeting_id = _meeting) THEN
    RAISE EXCEPTION 'punto dell''ordine del giorno estraneo alla riunione'; END IF;
  IF jsonb_typeof(_payload->'documents') = 'array' AND jsonb_array_length(_payload->'documents') > 20 THEN
    RAISE EXCEPTION 'massimo 20 documenti per delibera'; END IF;

  IF _id IS NOT NULL AND EXISTS (SELECT 1 FROM public.board_deliberation_conflicts c JOIN public.board_meeting_participants p ON p.id=c.participant_id WHERE c.deliberation_id=_id AND p.user_id=auth.uid()) THEN
    RAISE EXCEPTION 'conflitto di interessi: non puoi intervenire su questo punto'; END IF;
  IF _id IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('board_deliberation_number'));
    SELECT COALESCE(max(number),0)+1 INTO _n FROM public.board_deliberations WHERE meeting_id = _meeting;
    INSERT INTO public.board_deliberations(meeting_id, agenda_item_id, number, title, created_by)
      VALUES (_meeting, _item, _n, _title, auth.uid()) RETURNING id INTO _did;
    INSERT INTO public.board_deliberation_versions(deliberation_id, version, title, body, content_hash, created_by)
      VALUES (_did, 1, _title, _body, md5(_title || E'\n' || _body), auth.uid());
    INSERT INTO public.board_meeting_events(meeting_id, actor, action, detail)
      VALUES (_meeting, auth.uid(), 'deliberation_created', jsonb_build_object('deliberation_id', _did, 'number', _n, 'version', 1));
  ELSE
    SELECT * INTO _d FROM public.board_deliberations WHERE id = _id FOR UPDATE;
    IF _d.id IS NULL OR _d.meeting_id <> _meeting THEN RAISE EXCEPTION 'delibera inesistente'; END IF;
    IF _d.status IN ('APPROVATA','RITIRATA') THEN RAISE EXCEPTION 'la delibera non è più modificabile'; END IF;
    IF _d.status = 'IN_VOTAZIONE' THEN RAISE EXCEPTION 'delibera in votazione: il testo è bloccato'; END IF;
    IF EXISTS (SELECT 1 FROM public.board_ballots WHERE deliberation_id = _id AND status = 'aperta') THEN
      RAISE EXCEPTION 'votazione in corso su questa delibera'; END IF;
    SELECT * INTO _v FROM public.board_deliberation_versions WHERE deliberation_id = _id AND version = _d.current_version;
    _hash := md5(_title || E'\n' || _body);
    IF _v.title = _title AND _v.body = _body THEN
      UPDATE public.board_deliberations SET agenda_item_id = _item, updated_at = now() WHERE id = _id;
      _did := _id;
    ELSE
      _ver := _d.current_version + 1;
      INSERT INTO public.board_deliberation_versions(deliberation_id, version, title, body, content_hash, created_by)
        VALUES (_id, _ver, _title, _body, _hash, auth.uid());
      UPDATE public.board_deliberations SET agenda_item_id = _item, current_version = _ver, status = 'BOZZA',
        closed_reason = NULL, updated_at = now() WHERE id = _id;
      INSERT INTO public.board_meeting_events(meeting_id, actor, action, detail)
        VALUES (_meeting, auth.uid(), 'deliberation_version', jsonb_build_object('deliberation_id', _id, 'number', _d.number,
          'from', _d.current_version, 'to', _ver, 'hash', _hash));
      _did := _id;
    END IF;
  END IF;

  IF jsonb_typeof(_payload->'documents') = 'array' THEN
    DELETE FROM public.board_deliberation_documents WHERE deliberation_id = _did AND id::text NOT IN (SELECT x->>'id' FROM jsonb_array_elements(_payload->'documents') x WHERE x->>'id' IS NOT NULL);
    FOR _doc IN SELECT * FROM jsonb_array_elements(_payload->'documents') LOOP
      IF COALESCE(trim(_doc->>'name'),'') = '' THEN RAISE EXCEPTION 'nome documento obbligatorio'; END IF;
      IF _doc->>'id' IS NULL THEN
        INSERT INTO public.board_deliberation_documents(deliberation_id,name,kind,created_by)
          VALUES (_did,trim(_doc->>'name'),COALESCE(NULLIF(_doc->>'kind',''),'documento'),auth.uid());
      ELSE
        UPDATE public.board_deliberation_documents SET status='bozza',approved_at=NULL,name=trim(_doc->>'name'),kind=COALESCE(NULLIF(_doc->>'kind',''),'documento')
          WHERE id=(_doc->>'id')::uuid AND deliberation_id=_did;
        IF NOT FOUND THEN RAISE EXCEPTION 'documento estraneo alla bozza'; END IF;
      END IF;
    END LOOP;
  END IF;
  RETURN _did;
END $$;
CREATE OR REPLACE FUNCTION public.board_ballot_open(_deliberation uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _d public.board_deliberations; _m public.board_meetings; _q jsonb; _v public.board_deliberation_versions; _b uuid;
BEGIN
  PERFORM 1 FROM public.board_meetings WHERE id = (SELECT meeting_id FROM public.board_deliberations WHERE id = _deliberation) FOR UPDATE;
  IF NOT public.board_is_chair((SELECT meeting_id FROM public.board_deliberations WHERE id = _deliberation)) THEN RAISE EXCEPTION 'solo il Presidente può mettere ai voti'; END IF;
  SELECT * INTO _d FROM public.board_deliberations WHERE id = _deliberation FOR UPDATE;
  IF _d.id IS NULL THEN RAISE EXCEPTION 'delibera inesistente'; END IF;
  IF EXISTS (SELECT 1 FROM public.board_deliberation_conflicts c JOIN public.board_meeting_participants p ON p.id=c.participant_id
    WHERE c.deliberation_id=_deliberation AND p.user_id=auth.uid()) THEN
    RAISE EXCEPTION 'conflitto di chi presiede: registrare una sostituzione prima del voto'; END IF;
  SELECT * INTO _m FROM public.board_meetings WHERE id = _d.meeting_id FOR UPDATE;
  IF _m.status <> 'IN_CORSO' OR _m.started_at IS NULL OR _m.ended_at IS NOT NULL THEN RAISE EXCEPTION 'la seduta non è in corso'; END IF;
  IF _d.status <> 'BOZZA' THEN RAISE EXCEPTION 'solo una bozza può essere messa ai voti'; END IF;
  IF EXISTS (SELECT 1 FROM public.board_deliberation_documents WHERE deliberation_id=_deliberation AND pending_path IS NOT NULL) THEN RAISE EXCEPTION 'completare o rimuovere gli allegati in caricamento'; END IF;
  _q := public.board_ballot_quorum(_d.meeting_id,_d.id);
  IF NOT (_q->>'met')::boolean THEN RAISE EXCEPTION 'quorum non raggiunto: non è possibile deliberare'; END IF;
  IF EXISTS (SELECT 1 FROM public.board_ballots WHERE meeting_id = _d.meeting_id AND status = 'aperta') THEN
    RAISE EXCEPTION 'c''è già una votazione in corso'; END IF;
  SELECT * INTO _v FROM public.board_deliberation_versions WHERE deliberation_id = _d.id AND version = _d.current_version FOR UPDATE;
  UPDATE public.board_deliberation_versions SET locked_at = now() WHERE id = _v.id;
  INSERT INTO public.board_ballots(meeting_id, deliberation_id, version_id, opened_by, quorum)
    VALUES (_d.meeting_id, _d.id, _v.id, auth.uid(), _q) RETURNING id INTO _b;
  UPDATE public.board_ballots SET documents=COALESCE((SELECT jsonb_agg(to_jsonb(f) - 'pending_path' ORDER BY f.id) FROM public.board_deliberation_documents f WHERE f.deliberation_id=_deliberation),'[]'::jsonb) WHERE id=_b;
  UPDATE public.board_deliberations SET status = 'IN_VOTAZIONE', updated_at = now() WHERE id = _d.id;
  INSERT INTO public.board_meeting_events(meeting_id, actor, action, detail)
    VALUES (_d.meeting_id, auth.uid(), 'ballot_open', jsonb_build_object('deliberation_id', _d.id, 'ballot_id', _b,
      'number', _d.number, 'version', _v.version, 'hash', _v.content_hash, 'quorum', _q));
  RETURN _b;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
