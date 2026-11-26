-- ═══════════════════════════════════════════════════════════
-- Зачётные тесты КиЛЭ ВС — схема базы Supabase (проект kile-tests).
-- Выполняется один раз в SQL Editor. Повторный запуск безопасен.
--
-- Роли:
--   admin   — разработчики: всё, включая выдачу ролей;
--   teacher — преподаватель: тесты, вопросы, открыть/закрыть, результаты;
--   student — все остальные: проходят только открытые тесты.
-- Правильные ответы лежат в таблице questions, которую студент не может
-- прочитать; вопросы ему выдаёт start_test() без ответов, проверяет
-- submit_test() на сервере. Роль меняет только admin через set_role().
-- Если у сотрудника включён второй фактор (TOTP), его права работают
-- только в сессии, подтверждённой кодом (aal2).
-- В этом файле нет ни ключей, ни вопросов с ответами — его можно хранить
-- в открытом репозитории. Вопросы с ответами — только в базе.
-- ═══════════════════════════════════════════════════════════

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

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, group_name)
  values (new.id, coalesce(new.email, ''),
          left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120),
          left(coalesce(new.raw_user_meta_data ->> 'group_name', ''), 40))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Проверки ролей ───────────────────────────────────────
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

-- ── Тесты, вопросы, попытки ──────────────────────────────
create table if not exists public.tests (
  id              bigint generated always as identity primary key,
  title           text not null,
  topic           text not null default '',
  description     text not null default '',
  is_open         boolean not null default false,
  show_answers    boolean not null default true,   -- разбор с объяснениями после сдачи
  max_attempts    int check (max_attempts is null or max_attempts > 0),
  time_limit_min  int check (time_limit_min is null or time_limit_min > 0),
  sort            int not null default 0,
  created_at      timestamptz not null default now()
);
alter table public.tests enable row level security;

create table if not exists public.questions (
  id       bigint generated always as identity primary key,
  test_id  bigint not null references public.tests on delete cascade,
  ord      int not null default 0,
  q        text not null,
  options  jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6),
  answer   int not null check (answer >= 0),
  why      text not null default '',
  fig      text not null default ''          -- адрес страницы сайта «показать на модели», напр. da40-gear
);
alter table public.questions enable row level security;
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
alter table public.attempts enable row level security;
create index if not exists attempts_user on public.attempts (user_id, test_id);
create index if not exists attempts_test on public.attempts (test_id);

-- ── Права доступа к таблицам ─────────────────────────────
revoke all on public.profiles, public.tests, public.questions, public.attempts from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, group_name) on public.profiles to authenticated;
grant select, insert, update, delete on public.tests to authenticated;
grant select, insert, update, delete on public.questions to authenticated;
grant select, delete on public.attempts to authenticated;

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

-- ── Выдача теста студенту (без ответов) ──────────────────
create or replace function public.start_test(p_test bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.tests;
  a public.attempts;
  used int;
begin
  if auth.uid() is null then raise exception 'Нужно войти'; end if;
  select * into t from public.tests where id = p_test;
  if not found or (not t.is_open and not public.is_staff()) then
    raise exception 'Тест закрыт';
  end if;
  -- незаконченная попытка продолжается (перезагрузка страницы не сжигает попытку)
  select * into a from public.attempts
   where test_id = p_test and user_id = auth.uid() and finished_at is null
   order by started_at desc limit 1;
  if not found then
    select count(*) into used from public.attempts
     where test_id = p_test and user_id = auth.uid() and finished_at is not null;
    if t.max_attempts is not null and used >= t.max_attempts and not public.is_staff() then
      raise exception 'Попытки закончились';
    end if;
    insert into public.attempts (test_id, user_id) values (p_test, auth.uid()) returning * into a;
  end if;
  return jsonb_build_object(
    'attempt', a.id,
    'started_at', a.started_at,
    'now', now(),
    'test', jsonb_build_object('id', t.id, 'title', t.title, 'topic', t.topic,
                               'description', t.description, 'time_limit_min', t.time_limit_min),
    'questions', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'q', q.q,
                                    'options', q.options, 'fig', q.fig) order by q.ord, q.id)
                           from public.questions q where q.test_id = p_test), '[]'::jsonb));
end $$;

-- ── Проверка ответов на сервере ──────────────────────────
-- p_answers: {"<id вопроса>": <номер варианта>, ...}
create or replace function public.submit_test(p_attempt bigint, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a public.attempts;
  t public.tests;
  n_right int;
  n_total int;
  review jsonb;
begin
  select * into a from public.attempts where id = p_attempt and user_id = auth.uid() for update;
  if not found then raise exception 'Попытка не найдена'; end if;
  if a.finished_at is not null then raise exception 'Тест уже сдан'; end if;
  select * into t from public.tests where id = a.test_id;
  if not t.is_open and not public.is_staff() then raise exception 'Тест закрыт преподавателем'; end if;
  -- лимит времени + 2 минуты на связь
  if t.time_limit_min is not null and now() > a.started_at + make_interval(mins => t.time_limit_min + 2) then
    p_answers := '{}'::jsonb;   -- просрочено: засчитываем как пустую сдачу
  end if;
  if jsonb_typeof(coalesce(p_answers, 'null')) <> 'object' then p_answers := '{}'::jsonb; end if;

  select count(*),
         count(*) filter (where (p_answers ->> q.id::text) ~ '^\d{1,2}$' and (p_answers ->> q.id::text)::int = q.answer),
         jsonb_agg(jsonb_build_object('id', q.id, 'answer', q.answer, 'why', q.why,
                   'chosen', case when (p_answers ->> q.id::text) ~ '^\d{1,2}$' then (p_answers ->> q.id::text)::int end)
                   order by q.ord, q.id)
    into n_total, n_right, review
    from public.questions q where q.test_id = a.test_id;

  update public.attempts
     set finished_at = now(), answers = p_answers, score = n_right, total = n_total
   where id = a.id;

  return jsonb_build_object('score', n_right, 'total', n_total,
                            'review', case when t.show_answers then coalesce(review, '[]'::jsonb) end);
end $$;

-- ── Разбор своей сданной попытки (если преподаватель разрешил) ──
create or replace function public.attempt_review(p_attempt bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  a public.attempts;
  t public.tests;
begin
  select * into a from public.attempts where id = p_attempt and (user_id = auth.uid() or public.is_staff());
  if not found or a.finished_at is null then raise exception 'Попытка не найдена'; end if;
  select * into t from public.tests where id = a.test_id;
  if not t.show_answers and not public.is_staff() then raise exception 'Разбор закрыт'; end if;
  return jsonb_build_object('score', a.score, 'total', a.total,
    'questions', (select jsonb_agg(jsonb_build_object('id', q.id, 'q', q.q, 'options', q.options,
                   'answer', q.answer, 'why', q.why, 'fig', q.fig,
                   'chosen', case when (a.answers ->> q.id::text) ~ '^\d{1,2}$' then (a.answers ->> q.id::text)::int end)
                   order by q.ord, q.id) from public.questions q where q.test_id = a.test_id));
end $$;

-- ── Выдача ролей (только admin) ──────────────────────────
create or replace function public.set_role(p_email text, p_role text) returns text
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'Только для администратора'; end if;
  if p_role not in ('admin', 'teacher', 'student') then raise exception 'Нет такой роли'; end if;
  if lower(p_email) = lower(coalesce(auth.jwt() ->> 'email', '')) and p_role <> 'admin' then
    raise exception 'Себя понизить нельзя';
  end if;
  update public.profiles set role = p_role where lower(email) = lower(trim(p_email));
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Пользователь не найден — пусть сначала зарегистрируется на сайте'; end if;
  return p_role;
end $$;

-- ── Функции: только для вошедших ─────────────────────────
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.mfa_ok(), public.my_role(), public.is_staff(), public.is_admin(),
  public.start_test(bigint), public.submit_test(bigint, jsonb), public.attempt_review(bigint),
  public.set_role(text, text) from public, anon;
grant execute on function public.mfa_ok(), public.my_role(), public.is_staff(), public.is_admin(),
  public.start_test(bigint), public.submit_test(bigint, jsonb), public.attempt_review(bigint),
  public.set_role(text, text) to authenticated;
