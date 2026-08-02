-- ═══════════════════════════════════════════════════════════════════════════
-- SubTrack — Scope 2 / 2. Adım: Row Level Security
--
-- Kural: Her kullanıcı YALNIZCA kendi satırını görür ve değiştirebilir.
--
-- Performans notu: politikalarda auth.uid() yerine (select auth.uid())
-- kullanılıyor. Parantezli hâli PostgreSQL tarafından InitPlan olarak bir kez
-- hesaplanır; çıplak auth.uid() her satır için yeniden çalışır ve büyük
-- tablolarda seq scan'e döner. Supabase'in resmî RLS performans önerisidir.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Rol yetkileri ─────────────────────────────────────────────────────────
-- anon (giriş yapmamış) hiçbir veriye erişmemeli. RLS zaten engeller ama
-- yetkiyi de kaldırmak "defense in depth".
revoke all on public.categories        from anon;
revoke all on public.service_templates from anon;
revoke all on public.subscriptions     from anon;
revoke all on public.contracts         from anon;
revoke all on public.price_changes     from anon;

grant select                         on public.categories        to authenticated;
grant insert, update, delete         on public.categories        to authenticated;
grant select                         on public.service_templates to authenticated;
grant select, insert, update, delete on public.subscriptions     to authenticated;
grant select, insert, update, delete on public.contracts         to authenticated;
grant select                         on public.price_changes     to authenticated;  -- append-only log

-- View'lar (Scope 3 dashboard buradan okur). security_invoker = true olduğu için
-- altlarındaki tabloların RLS'i geçerli kalır; yine de SELECT yetkisi gerekir.
revoke all  on public.v_subscriptions_enriched from anon;
revoke all  on public.v_dashboard_summary      from anon;
grant select on public.v_subscriptions_enriched to authenticated;
grant select on public.v_dashboard_summary      to authenticated;

-- ─── RLS'i aç ──────────────────────────────────────────────────────────────
alter table public.categories        enable row level security;
alter table public.service_templates enable row level security;
alter table public.subscriptions     enable row level security;
alter table public.contracts         enable row level security;
alter table public.price_changes     enable row level security;

-- ═══════════════════════════════════════════════════════════════════════════
-- categories — global satırlar (user_id IS NULL) herkese okunur,
--              kullanıcı yalnızca kendi kategorisini yazabilir.
-- ═══════════════════════════════════════════════════════════════════════════
drop policy if exists categories_select on public.categories;
create policy categories_select on public.categories
  for select to authenticated
  using (user_id is null or user_id = (select auth.uid()));

drop policy if exists categories_insert on public.categories;
create policy categories_insert on public.categories
  for insert to authenticated
  -- user_id NULL bırakılamaz ⇒ kullanıcı global kategori uyduramaz
  with check (user_id = (select auth.uid()));

drop policy if exists categories_update on public.categories;
create policy categories_update on public.categories
  for update to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists categories_delete on public.categories;
create policy categories_delete on public.categories
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- service_templates — global katalog, herkese salt-okunur.
-- Yazma politikası YOK ⇒ yalnızca service_role (backend) değiştirebilir.
-- ═══════════════════════════════════════════════════════════════════════════
drop policy if exists service_templates_select on public.service_templates;
create policy service_templates_select on public.service_templates
  for select to authenticated
  using (is_active);

-- ═══════════════════════════════════════════════════════════════════════════
-- subscriptions
-- ═══════════════════════════════════════════════════════════════════════════
drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists subscriptions_insert on public.subscriptions;
create policy subscriptions_insert on public.subscriptions
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists subscriptions_update on public.subscriptions;
create policy subscriptions_update on public.subscriptions
  for update to authenticated
  using      (user_id = (select auth.uid()))
  -- with check ⇒ kullanıcı kendi satırını başkasının üstüne yazamaz
  with check (user_id = (select auth.uid()));

drop policy if exists subscriptions_delete on public.subscriptions;
create policy subscriptions_delete on public.subscriptions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- contracts
-- Not: sahiplik ayrıca contracts_enforce_owner trigger'ı ile de doğrulanır
-- (taahhüt, bağlı olduğu aboneliğin sahibine ait olmak zorunda).
-- ═══════════════════════════════════════════════════════════════════════════
drop policy if exists contracts_select on public.contracts;
create policy contracts_select on public.contracts
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists contracts_insert on public.contracts;
create policy contracts_insert on public.contracts
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists contracts_update on public.contracts;
create policy contracts_update on public.contracts
  for update to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists contracts_delete on public.contracts;
create policy contracts_delete on public.contracts
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- price_changes — salt-okunur denetim kaydı.
-- INSERT/UPDATE/DELETE politikası bilinçli olarak YOK: satırları yalnızca
-- log_price_change() trigger'ı (security definer) yazar, kullanıcı geçmişi
-- değiştiremez.
-- ═══════════════════════════════════════════════════════════════════════════
drop policy if exists price_changes_select on public.price_changes;
create policy price_changes_select on public.price_changes
  for select to authenticated
  using (user_id = (select auth.uid()));
