-- =============================================================================
-- Phase 4: certificates are numbered and snapshotted inside Postgres.
-- The client only chooses student, class, type, title, wording and links;
-- the number, names, class/year names, issuer and revoked flag are set here,
-- so nobody (teacher or headmaster) can forge them from the browser.
-- =============================================================================

alter table public.certificates
  alter column issued_on set default ((now() at time zone 'Asia/Kolkata')::date);

create or replace function public.trg_certificate_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  s public.students;
  c public.classes;
  y public.academic_years;
  yr int;
  v int;
begin
  select * into s from public.students where id = new.student_id;
  if not found then raise exception 'student not found' using errcode = '23503'; end if;

  new.class_id := coalesce(new.class_id, s.class_id);
  if new.class_id is null then
    raise exception 'student is not in a class' using errcode = '23514';
  end if;
  select * into c from public.classes where id = new.class_id;
  if not found then raise exception 'class not found' using errcode = '23503'; end if;
  select * into y from public.academic_years where id = c.academic_year_id;

  -- linked exam / activity must belong to the same class
  if new.exam_id is not null and public.exam_class_id(new.exam_id) is distinct from new.class_id then
    raise exception 'exam is not for this class' using errcode = '23514';
  end if;
  if new.activity_id is not null
     and (select class_id from public.activities where id = new.activity_id) is distinct from new.class_id then
    raise exception 'activity is not for this class' using errcode = '23514';
  end if;

  new.academic_year_id := c.academic_year_id;
  new.student_name := s.full_name;
  new.student_name_ml := s.full_name_ml;
  new.class_name := case when coalesce(c.section, '') = '' then c.name else c.name || ' - ' || c.section end;
  new.year_name := y.name;
  select string_agg(p.full_name, ', ' order by p.full_name) into new.class_teacher_name
    from public.class_teachers ct join public.profiles p on p.id = ct.teacher_id
   where ct.class_id = new.class_id and p.active;
  new.revoked := false;
  new.revoked_at := null;
  if auth.uid() is not null then new.issued_by := auth.uid(); end if;
  new.created_at := now();

  -- CERT-<start year of current academic year>-NNNN, gap-free within a transaction
  yr := public.current_number_year();
  insert into public.number_counters (kind, year, last_value) values ('certificate', yr, 1)
  on conflict (kind, year) do update set last_value = public.number_counters.last_value + 1
  returning last_value into v;
  new.certificate_no := 'CERT-' || yr || '-' || lpad(v::text, 4, '0');
  return new;
end; $$;

create trigger certificates_insert before insert on public.certificates
for each row execute function public.trg_certificate_insert();

-- Once issued, only the revoked flag may change (keeps re-downloads identical).
-- Links may still become null through ON DELETE SET NULL of the referenced rows.
create or replace function public.trg_certificate_freeze()
returns trigger language plpgsql as $$
declare
  links constant text[] := array['exam_id', 'activity_id', 'class_id', 'issued_by'];
  k text;
begin
  foreach k in array links loop
    if (to_jsonb(new) ->> k) is not null and (to_jsonb(new) ->> k) is distinct from (to_jsonb(old) ->> k) then
      raise exception 'issued certificates cannot be edited; revoke and issue a new one' using errcode = '42501';
    end if;
  end loop;
  if (to_jsonb(new) - 'revoked' - 'revoked_at' - links) is distinct from (to_jsonb(old) - 'revoked' - 'revoked_at' - links) then
    raise exception 'issued certificates cannot be edited; revoke and issue a new one' using errcode = '42501';
  end if;
  return new;
end; $$;

create trigger certificates_freeze before update on public.certificates
for each row execute function public.trg_certificate_freeze();
