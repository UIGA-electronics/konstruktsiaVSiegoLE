-- ═══════════════════════════════════════════════════════════
-- Зачёт КиЛЭ ВС — схема базы Supabase (проект kile-tests), версия 2.
-- Выполняется целиком в SQL Editor. Повторный запуск безопасен:
-- и на пустой базе, и поверх версии 1.
--
-- Роли:
--   admin   — разработчики: всё, включая роли;
--   teacher — преподаватель: тесты, вопросы, открыть/закрыть, ведомость,
--             новые пароли студентам;
--   student — все остальные: сдают открытые тесты.
-- Правильные ответы лежат в public.questions, которую студент прочитать
-- не может. Тест выдаёт exam_start() — без ответов, в случайном порядке;
-- ответы сохраняет exam_save(), балл считает exam_submit() — на сервере.
-- Закрытие теста преподавателем засчитывает начатые попытки по
-- сохранённым ответам; просроченные по времени — так же.
-- Если у сотрудника включён код с телефона (TOTP), его права действуют
-- только в сессии, подтверждённой кодом (aal2).
-- Здесь нет ни ключей, ни вопросов с ответами — файл можно держать
-- в открытом репозитории.
-- ═══════════════════════════════════════════════════════════

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Supabase по умолчанию даёт anon/authenticated право вызывать новые функции в public — убираем;
-- право PUBLIC так не снимается (оно глобальное), поэтому ниже у каждой функции оно снято явно
alter default privileges in schema public revoke execute on functions from anon, authenticated;

-- ── Профили ──────────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  email       text not null default '',
  full_name   text not null default '',
  group_name  text not null default '',
  role        text not null default 'student' check (role in ('admin', 'teacher', 'student')),
  created_at  timestamptz not null default now()
);
alter table public.profiles enable row level security;
alter table public.profiles drop constraint if exists profiles_len;
alter table public.profiles add constraint profiles_len
  check (char_length(full_name) <= 120 and char_length(group_name) <= 40 and char_length(email) <= 320);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, group_name)
  values (new.id, coalesce(new.email, ''),
          left(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 120),
          left(upper(trim(coalesce(new.raw_user_meta_data ->> 'group_name', ''))), 40))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ФИО и группа без лишних пробелов, группа заглавными: «п-24-4 » → «П-24-4»
create or replace function public.profiles_norm() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.full_name := left(regexp_replace(trim(new.full_name), '\s+', ' ', 'g'), 120);
  new.group_name := left(upper(regexp_replace(trim(new.group_name), '\s+', '', 'g')), 40);
  return new;
end $$;
drop trigger if exists profiles_norm on public.profiles;
create trigger profiles_norm before insert or update of full_name, group_name on public.profiles
  for each row execute function public.profiles_norm();

-- смена почты в auth — та же почта в профиле
create or replace function public.handle_user_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end $$;
drop trigger if exists on_auth_user_email on auth.users;
create trigger on_auth_user_email after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email();

-- ── Проверки ролей (нужны политикам — доступны вошедшим) ──
create or replace function public.mfa_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f
                     where f.user_id = auth.uid() and f.status = 'verified');
$$;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'student');
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.my_role() in ('admin', 'teacher') and public.mfa_ok();
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.my_role() = 'admin' and public.mfa_ok();
$$;

-- ── Тесты, вопросы, попытки, доп. попытки ───────────────
create table if not exists public.tests (
  id              bigint generated always as identity primary key,
  title           text not null,
  topic           text not null default '',
  description     text not null default '',
  is_open         boolean not null default false,
  show_answers    boolean not null default false,
  max_attempts    int,
  time_limit_min  int,
  sort            int not null default 0,
  created_at      timestamptz not null default now()
);
alter table public.tests add column if not exists questions_per_attempt int;
alter table public.tests add column if not exists shuffle boolean not null default true;
alter table public.tests add column if not exists pass_percent int not null default 60;
alter table public.tests add column if not exists opened_at timestamptz;
alter table public.tests add column if not exists closed_at timestamptz;
alter table public.tests alter column show_answers set default false;
alter table public.tests enable row level security;
alter table public.tests drop constraint if exists tests_max_attempts_check;
alter table public.tests drop constraint if exists tests_time_limit_min_check;
alter table public.tests drop constraint if exists tests_ok;
alter table public.tests add constraint tests_ok check (
  char_length(title) between 1 and 200 and char_length(topic) <= 200 and char_length(description) <= 2000
  and (max_attempts is null or max_attempts between 1 and 50)
  and (time_limit_min is null or time_limit_min between 1 and 600)
  and (questions_per_attempt is null or questions_per_attempt between 1 and 500)
  and pass_percent between 1 and 100);

create table if not exists public.questions (
  id       bigint generated always as identity primary key,
  test_id  bigint not null references public.tests on delete cascade,
  ord      int not null default 0,
  q        text not null,
  options  jsonb not null,
  answer   int not null,
  why      text not null default '',
  fig      text not null default ''          -- адрес раздела сайта для разбора, напр. fc-booster
);
alter table public.questions enable row level security;
alter table public.questions drop constraint if exists questions_options_check;
alter table public.questions drop constraint if exists questions_answer_check;
alter table public.questions drop constraint if exists questions_ok;
alter table public.questions add constraint questions_ok check (
  char_length(q) between 1 and 2000 and char_length(why) <= 3000 and char_length(fig) <= 100
  and jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6
  and char_length(options::text) <= 4000
  and answer >= 0 and answer < jsonb_array_length(options));
create index if not exists questions_test on public.questions (test_id, ord);

create table if not exists public.attempts (
  id           bigint generated always as identity primary key,
  test_id      bigint not null references public.tests on delete cascade,
  user_id      uuid not null references public.profiles on delete cascade,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  answers      jsonb,
  score        int,
  total        int
);
alter table public.attempts add column if not exists qids bigint[];
alter table public.attempts add column if not exists deadline timestamptz;
alter table public.attempts add column if not exists saved_at timestamptz;
alter table public.attempts add column if not exists finished_how text;
alter table public.attempts enable row level security;
create index if not exists attempts_user on public.attempts (user_id, test_id);
create index if not exists attempts_test on public.attempts (test_id);
create index if not exists attempts_going on public.attempts (deadline) where finished_at is null;

create table if not exists public.retakes (
  test_id  bigint not null references public.tests on delete cascade,
  user_id  uuid not null references public.profiles on delete cascade,
  extra    int not null default 0 check (extra between 0 and 50),
  primary key (test_id, user_id)
);
alter table public.retakes enable row level security;

-- ── Права на таблицы ─────────────────────────────────────
revoke all on public.profiles, public.tests, public.questions, public.attempts, public.retakes from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, group_name) on public.profiles to authenticated;
grant select, insert, update, delete on public.tests to authenticated;
grant select, insert, update, delete on public.questions to authenticated;
grant select, delete on public.attempts to authenticated;
grant select, insert, update, delete on public.retakes to authenticated;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_staff()));
drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists tests_read on public.tests;
create policy tests_read on public.tests for select to authenticated
  using (is_open or (select public.is_staff()));
drop policy if exists tests_staff on public.tests;
create policy tests_staff on public.tests for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

drop policy if exists questions_staff on public.questions;
create policy questions_staff on public.questions for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

drop policy if exists attempts_read on public.attempts;
create policy attempts_read on public.attempts for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));
drop policy if exists attempts_staff_del on public.attempts;
create policy attempts_staff_del on public.attempts for delete to authenticated
  using ((select public.is_staff()));

drop policy if exists retakes_staff on public.retakes;
create policy retakes_staff on public.retakes for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

-- ── Открытие и закрытие теста ────────────────────────────
create or replace function public.tests_toggle() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_open and not old.is_open then new.opened_at := now(); new.closed_at := null; end if;
  if old.is_open and not new.is_open then new.closed_at := now(); end if;
  return new;
end $$;
drop trigger if exists tests_toggle on public.tests;
create trigger tests_toggle before update of is_open on public.tests
  for each row execute function public.tests_toggle();

-- закрыли тест — начатые попытки засчитываются по сохранённым ответам
create or replace function public.tests_closed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if old.is_open and not new.is_open then
    for r in select a.id from public.attempts a where a.test_id = new.id and a.finished_at is null loop
      perform private.finish_attempt(r.id, 'closed', null);
    end loop;
  end if;
  return null;
end $$;
drop trigger if exists tests_closed on public.tests;
create trigger tests_closed after update of is_open on public.tests
  for each row execute function public.tests_closed();

-- ── Внутренние функции (снаружи не вызываются) ──────────
-- только номера вопросов этой попытки и допустимые номера вариантов
create or replace function private.clean_answers(p_qids bigint[], p_ans jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(q.id::text, (p_ans ->> q.id::text)::int), '{}'::jsonb)
  from public.questions q
  where q.id = any (coalesce(p_qids, '{}'::bigint[]))
    and jsonb_typeof(p_ans) = 'object'
    and case when (p_ans ->> q.id::text) ~ '^[0-9]{1,2}$'
             then (p_ans ->> q.id::text)::int < jsonb_array_length(q.options) else false end;
$$;

create or replace function private.finish_attempt(p_attempt bigint, p_how text, p_answers jsonb) returns public.attempts
language plpgsql security definer set search_path = '' as $$
declare a public.attempts; ans jsonb;
begin
  select * into a from public.attempts where id = p_attempt for update;
  if not found or a.finished_at is not null then return a; end if;
  ans := private.clean_answers(a.qids, coalesce(p_answers, a.answers));
  update public.attempts set
    answers = ans, finished_at = now(), finished_how = p_how,
    total = (select count(*) from public.questions q where q.id = any (coalesce(a.qids, '{}'::bigint[]))),
    score = (select count(*) from public.questions q where q.id = any (coalesce(a.qids, '{}'::bigint[]))
              and (ans ->> q.id::text)::int = q.answer)
  where id = a.id returning * into a;
  return a;
end $$;

-- просроченные по времени попытки (минута на связь)
create or replace function private.expire_stale(p_user uuid, p_test bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select a.id from public.attempts a
           where a.finished_at is null and a.deadline is not null and a.deadline < now() - interval '60 seconds'
             and (p_user is null or a.user_id = p_user) and (p_test is null or a.test_id = p_test) loop
    perform private.finish_attempt(r.id, 'timeout', null);
  end loop;
end $$;

create or replace function private.attempts_allowed(t public.tests, p_user uuid) returns int
language sql stable security definer set search_path = '' as $$
  select case when t.max_attempts is null then null
              else t.max_attempts + coalesce((select r.extra from public.retakes r
                                              where r.test_id = t.id and r.user_id = p_user), 0) end;
$$;

create or replace function private.review_json(a public.attempts) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'q', q.q, 'options', q.options, 'answer', q.answer,
           'why', q.why, 'fig', q.fig,
           'chosen', case when (a.answers ->> q.id::text) ~ '^[0-9]{1,2}$' then (a.answers ->> q.id::text)::int end)
         order by k.n), '[]'::jsonb)
  from unnest(coalesce(a.qids, '{}'::bigint[])) with ordinality k(qid, n)
  join public.questions q on q.id = k.qid;
$$;

create or replace function private.result_json(a public.attempts) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t public.tests; pct int;
begin
  select * into t from public.tests where id = a.test_id;
  pct := case when coalesce(a.total, 0) = 0 then 0 else round(100.0 * a.score / a.total) end;
  return jsonb_build_object('attempt', a.id, 'test', t.id, 'title', t.title, 'score', a.score, 'total', a.total,
    'percent', pct, 'pass', pct >= t.pass_percent, 'pass_percent', t.pass_percent, 'how', a.finished_how,
    'finished_at', a.finished_at, 'show_answers', t.show_answers,
    'review', case when t.show_answers or public.is_staff() then private.review_json(a) end);
end $$;

-- ── Студент: список тестов ───────────────────────────────
create or replace function public.exam_my_tests() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Нужно войти'; end if;
  perform private.expire_stale(uid, null);
  return (select coalesce(jsonb_agg(to_jsonb(x) order by x.sort, x.id), '[]'::jsonb) from (
    select t.id, t.sort, t.title, t.topic, t.description, t.is_open, t.time_limit_min, t.show_answers, t.pass_percent,
      private.attempts_allowed(t, uid) as allowed,
      case when t.questions_per_attempt is null then nq.n else least(t.questions_per_attempt, nq.n) end as n_questions,
      (select count(*) from public.attempts a where a.test_id = t.id and a.user_id = uid) as used,
      (select jsonb_build_object('attempt', a.id, 'deadline', a.deadline,
              'answered', (select count(*) from jsonb_object_keys(coalesce(a.answers, '{}'::jsonb))),
              'total', cardinality(a.qids))
         from public.attempts a where a.test_id = t.id and a.user_id = uid and a.finished_at is null
         order by a.started_at desc limit 1) as going,
      (select jsonb_build_object('attempt', a.id, 'score', a.score, 'total', a.total,
              'percent', case when coalesce(a.total, 0) = 0 then 0 else round(100.0 * a.score / a.total) end)
         from public.attempts a where a.test_id = t.id and a.user_id = uid and a.finished_at is not null
         order by a.score::float8 / nullif(a.total, 0) desc nulls last, a.finished_at desc limit 1) as best
    from public.tests t
    cross join lateral (select count(*)::int as n from public.questions q where q.test_id = t.id) nq
  ) x);
end $$;

-- ── Студент: начать или продолжить попытку ───────────────
create or replace function public.exam_start(p_test bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  staff boolean := public.is_staff();
  t public.tests;
  a public.attempts;
  used int;
  allowed int;
  v_qids bigint[];
begin
  if uid is null then raise exception 'Нужно войти'; end if;
  perform private.expire_stale(uid, p_test);
  select * into t from public.tests where id = p_test;
  if not found then raise exception 'Тест не найден'; end if;
  select * into a from public.attempts
   where test_id = p_test and user_id = uid and finished_at is null order by started_at desc limit 1;
  if not found then
    if not t.is_open and not staff then raise exception 'Тест закрыт — его откроет преподаватель'; end if;
    allowed := private.attempts_allowed(t, uid);
    select count(*) into used from public.attempts where test_id = p_test and user_id = uid;
    if allowed is not null and used >= allowed and not staff then raise exception 'Попытки закончились'; end if;
    select coalesce(array_agg(x.id order by case when t.shuffle then x.r end, x.ord, x.id), '{}'::bigint[])
      into v_qids
      from (select q.id, q.ord, random() as r from public.questions q where q.test_id = p_test
            order by case when t.questions_per_attempt is null then 0::float8 else random() end
            limit t.questions_per_attempt) x;
    if cardinality(v_qids) = 0 then raise exception 'В тесте пока нет вопросов'; end if;
    insert into public.attempts (test_id, user_id, qids, answers, deadline)
    values (p_test, uid, v_qids, '{}'::jsonb,
            case when t.time_limit_min is not null then now() + make_interval(mins => t.time_limit_min) end)
    returning * into a;
  end if;
  return jsonb_build_object(
    'attempt', a.id, 'deadline', a.deadline, 'now', now(), 'answers', coalesce(a.answers, '{}'::jsonb),
    'staff', staff,
    'test', jsonb_build_object('id', t.id, 'title', t.title, 'topic', t.topic, 'description', t.description,
                               'time_limit_min', t.time_limit_min, 'pass_percent', t.pass_percent),
    'questions', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'q', q.q,
        'options', (select jsonb_agg(jsonb_build_object('i', o.i - 1, 't', o.v)
                     order by case when t.shuffle then md5(a.id::text || '/' || q.id::text || '/' || o.i::text) end, o.i)
                    from jsonb_array_elements_text(q.options) with ordinality o(v, i)))
        order by k.n), '[]'::jsonb)
      from unnest(a.qids) with ordinality k(qid, n) join public.questions q on q.id = k.qid));
end $$;

-- ── Студент: сохранить ответы (после каждого выбора) ────
create or replace function public.exam_save(p_attempt bigint, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a public.attempts;
begin
  select * into a from public.attempts where id = p_attempt and user_id = auth.uid() for update;
  if not found then raise exception 'Попытка не найдена'; end if;
  if a.finished_at is not null then return jsonb_build_object('finished', true, 'how', a.finished_how); end if;
  if a.deadline is not null and now() > a.deadline + interval '30 seconds' then
    perform private.finish_attempt(a.id, 'timeout', null);
    return jsonb_build_object('finished', true, 'how', 'timeout');
  end if;
  update public.attempts set answers = private.clean_answers(a.qids, p_answers), saved_at = now() where id = a.id;
  return jsonb_build_object('ok', true, 'saved_at', now());
end $$;

-- ── Студент: сдать ───────────────────────────────────────
create or replace function public.exam_submit(p_attempt bigint, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a public.attempts;
begin
  select * into a from public.attempts where id = p_attempt and user_id = auth.uid() for update;
  if not found then raise exception 'Попытка не найдена'; end if;
  if a.finished_at is null then
    if a.deadline is not null and now() > a.deadline + interval '60 seconds' then
      a := private.finish_attempt(a.id, 'timeout', null);       -- поздно: по сохранённым вовремя ответам
    else
      a := private.finish_attempt(a.id, 'submit', p_answers);
    end if;
  end if;
  return private.result_json(a);
end $$;

-- ── Разбор сданной попытки ───────────────────────────────
create or replace function public.exam_review(p_attempt bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a public.attempts; t public.tests;
begin
  select * into a from public.attempts where id = p_attempt and (user_id = auth.uid() or public.is_staff());
  if not found or a.finished_at is null then raise exception 'Попытка не найдена'; end if;
  select * into t from public.tests where id = a.test_id;
  if not t.show_answers and not public.is_staff() then raise exception 'Разбор пока закрыт преподавателем'; end if;
  return private.result_json(a) || jsonb_build_object('student',
    (select jsonb_build_object('full_name', p.full_name, 'group_name', p.group_name, 'email', p.email)
       from public.profiles p where p.id = a.user_id));
end $$;

-- ── Преподаватель: обзор тестов ──────────────────────────
create or replace function public.exam_staff_overview() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Только для преподавателя'; end if;
  perform private.expire_stale(null, null);
  return (select coalesce(jsonb_agg(to_jsonb(x) order by x.sort, x.id), '[]'::jsonb) from (
    select t.*, nq.n as n_pool, st.n_done, st.n_students, st.n_passed, st.avg_percent,
      (select count(*) from public.attempts a join public.profiles p on p.id = a.user_id and p.role = 'student'
        where a.test_id = t.id and a.finished_at is null) as n_going
    from public.tests t
    cross join lateral (select count(*)::int as n from public.questions q where q.test_id = t.id) nq
    cross join lateral (
      select count(*) as n_done, count(distinct a.user_id) as n_students,
             round(avg(100.0 * a.score / nullif(a.total, 0))) as avg_percent,
             count(distinct a.user_id) filter (where 100.0 * a.score / nullif(a.total, 0) >= t.pass_percent) as n_passed
        from public.attempts a join public.profiles p on p.id = a.user_id and p.role = 'student'
       where a.test_id = t.id and a.finished_at is not null) st
  ) x);
end $$;

-- ── Преподаватель: кто проходит прямо сейчас ─────────────
create or replace function public.exam_staff_live(p_test bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Только для преподавателя'; end if;
  perform private.expire_stale(null, p_test);
  return (select coalesce(jsonb_agg(jsonb_build_object('attempt', a.id, 'full_name', p.full_name,
      'group_name', p.group_name, 'email', p.email, 'role', p.role, 'started_at', a.started_at,
      'deadline', a.deadline, 'saved_at', a.saved_at, 'total', cardinality(a.qids),
      'answered', (select count(*) from jsonb_object_keys(coalesce(a.answers, '{}'::jsonb))))
      order by p.group_name, p.full_name), '[]'::jsonb)
    from public.attempts a join public.profiles p on p.id = a.user_id
   where a.test_id = p_test and a.finished_at is null);
end $$;

-- ── Люди ─────────────────────────────────────────────────
create or replace function public.exam_people() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Только для преподавателя'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'email', p.email, 'full_name', p.full_name,
      'group_name', p.group_name, 'role', p.role, 'created_at', p.created_at, 'last_sign_in_at', u.last_sign_in_at,
      'mfa', exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified'))
      order by p.role = 'student', p.group_name, p.full_name), '[]'::jsonb)
    from public.profiles p left join auth.users u on u.id = p.id);
end $$;

create or replace function public.exam_set_role(p_user uuid, p_role text) returns text
language plpgsql security definer set search_path = '' as $$
declare old_role text;
begin
  if not public.is_admin() then raise exception 'Роли меняют только разработчики'; end if;
  if p_role not in ('admin', 'teacher', 'student') then raise exception 'Нет такой роли'; end if;
  if p_user = auth.uid() then raise exception 'Свою роль изменить нельзя'; end if;
  select role into old_role from public.profiles where id = p_user for update;
  if not found then raise exception 'Пользователь не найден'; end if;
  if old_role = 'admin' and p_role <> 'admin'
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'Нельзя убрать последнего разработчика';
  end if;
  update public.profiles set role = p_role where id = p_user;
  return p_role;
end $$;

-- ещё одна попытка студенту (история попыток не стирается)
create or replace function public.exam_give_retake(p_test bigint, p_user uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not public.is_staff() then raise exception 'Только для преподавателя'; end if;
  insert into public.retakes (test_id, user_id, extra) values (p_test, p_user, 1)
  on conflict (test_id, user_id) do update set extra = least(public.retakes.extra + 1, 50)
  returning extra into n;
  return n;
end $$;

-- новый пароль студенту, который забыл свой (почта у проекта не рассылается);
-- пароли сотрудников так не сбрасываются — только через панель Supabase
create or replace function public.exam_reset_password(p_user uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  abc text := 'abcdefghjkmnpqrstuvwxyz23456789';
  b bytea := extensions.gen_random_bytes(10);
  pw text := '';
  r text;
begin
  if not public.is_staff() then raise exception 'Только для преподавателя'; end if;
  select role into r from public.profiles where id = p_user;
  if not found then raise exception 'Пользователь не найден'; end if;
  if r <> 'student' then raise exception 'Пароль сотрудника так не сбрасывается'; end if;
  for i in 0..9 loop
    pw := pw || substr(abc, 1 + get_byte(b, i) % length(abc), 1);
  end loop;
  pw := substr(pw, 1, 5) || '-' || substr(pw, 6, 5);
  update auth.users set encrypted_password = extensions.crypt(pw, extensions.gen_salt('bf', 10)), updated_at = now()
   where id = p_user;
  delete from auth.sessions where user_id = p_user;     -- выйти на всех устройствах
  return pw;
end $$;

-- сбросить код с телефона сотруднику, который потерял телефон
create or replace function public.exam_reset_mfa(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Только для разработчиков'; end if;
  if p_user = auth.uid() then raise exception 'Свой код так не сбрасывается'; end if;
  delete from auth.mfa_factors where user_id = p_user;
end $$;

-- ── Версия 1: функции заменены ───────────────────────────
drop function if exists public.start_test(bigint);
drop function if exists public.submit_test(bigint, jsonb);
drop function if exists public.attempt_review(bigint);
drop function if exists public.set_role(text, text);

-- ── Кто что может вызывать ───────────────────────────────
revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.handle_new_user(), public.handle_user_email(), public.profiles_norm(),
  public.tests_toggle(), public.tests_closed() from public, anon, authenticated;
revoke execute on function public.mfa_ok(), public.my_role(), public.is_staff(), public.is_admin(),
  public.exam_my_tests(), public.exam_start(bigint), public.exam_save(bigint, jsonb), public.exam_submit(bigint, jsonb),
  public.exam_review(bigint), public.exam_staff_overview(), public.exam_staff_live(bigint), public.exam_people(),
  public.exam_set_role(uuid, text), public.exam_give_retake(bigint, uuid), public.exam_reset_password(uuid),
  public.exam_reset_mfa(uuid) from public, anon;
grant execute on function public.mfa_ok(), public.my_role(), public.is_staff(), public.is_admin(),
  public.exam_my_tests(), public.exam_start(bigint), public.exam_save(bigint, jsonb), public.exam_submit(bigint, jsonb),
  public.exam_review(bigint), public.exam_staff_overview(), public.exam_staff_live(bigint), public.exam_people(),
  public.exam_set_role(uuid, text), public.exam_give_retake(bigint, uuid), public.exam_reset_password(uuid),
  public.exam_reset_mfa(uuid) to authenticated;
