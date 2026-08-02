-- ═══════════════════════════════════════════════════════════════════════════
-- SubTrack — public.users için RLS  (AYRI DOSYA: bilinçli tercih)
--
-- ⚠️  NEDEN AYRI?
-- Bu dosya çalışan auth akışına dokunan tek migration. Scope 2'nin geri kalanı
-- onsuz da çalışır. Ama şu an public.users'ta RLS kapalıysa, anon anahtarına
-- sahip HERKES tüm kullanıcıların e-postalarını çekebilir:
--     GET /rest/v1/users?select=email    → tüm liste
-- Bu gerçek bir veri sızıntısıdır; kapatılması önerilir.
--
-- ✅ AKIŞI BOZAR MI?
-- Hayır. app/auth/callback.tsx içindeki upsert'ün ihtiyacı olan üç yetki de
-- (INSERT + UPDATE + SELECT, kendi id'si için) aşağıda tanımlı.
--
-- 🔍 ÖNCE KONTROL ET — RLS zaten açık mı, mevcut politika var mı:
--     select relrowsecurity from pg_class where relname = 'users';
--     select policyname, cmd, qual from pg_policies where tablename = 'users';
-- Politikalar zaten varsa bu dosyayı ÇALIŞTIRMA.
--
-- 🧪 UYGULADIKTAN SONRA: çıkış yap → Google ile tekrar giriş yap →
--    konsolda "[Callback] ✅ Kullanıcı kaydedildi" satırını gör.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.users enable row level security;

revoke all on public.users from anon;
grant select, insert, update on public.users to authenticated;

-- Kullanıcı yalnızca kendi profilini okur.
drop policy if exists users_select_own on public.users;
create policy users_select_own on public.users
  for select to authenticated
  using (id = (select auth.uid()));

-- Yalnızca kendi auth kimliğiyle profil oluşturabilir (upsert'ün INSERT ayağı).
drop policy if exists users_insert_own on public.users;
create policy users_insert_own on public.users
  for insert to authenticated
  with check (id = (select auth.uid()));

-- Kendi profilini günceller (upsert'ün UPDATE ayağı).
drop policy if exists users_update_own on public.users;
create policy users_update_own on public.users
  for update to authenticated
  using      (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- DELETE politikası bilinçli olarak yok: hesap silme auth katmanından
-- (service_role / Supabase Admin API) yapılmalı.
