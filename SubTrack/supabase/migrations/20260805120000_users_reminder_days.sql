-- ═══════════════════════════════════════════════════════════════════════════
-- SubTrack — public.users.reminder_days
--
-- Kullanıcının hesap genelindeki hatırlatma tercihi: ödeme/taahhüt tarihinden
-- kaç gün önce bildirim istiyor.
--
-- ⚠ subscriptions.reminder_days_before ile ilişkisi
-- Abonelik tablosunda zaten satır bazlı bir hatırlatma alanı var (0–90,
-- varsayılan 3). İkisi çakışmıyor, kademeli çalışıyorlar:
--
--   users.reminder_days             → hesap varsayılanı. Yeni abonelik
--                                     formunu ön-doldurur.
--   subscriptions.reminder_days_before → o aboneliğe özel değer. Bildirim
--                                     zamanlanırken ESAS ALINAN budur.
--
-- Yani ayarı değiştirmek geçmiş abonelikleri geriye dönük değiştirmez;
-- kullanıcı tek bir abonelik için farklı bir gün seçebilsin diye böyle.
-- Global ayarın her şeyi ezmesi istenirse zamanlayıcıdaki tek satır
-- değiştirilir (bkz. utils/notifications.ts).
--
-- Idempotent: tekrar çalıştırılabilir.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.users
  add column if not exists reminder_days smallint not null default 3;

-- CHECK'i ayrı ekliyoruz: "add column if not exists" ikinci çalıştırmada
-- kolonu atlar ama constraint'i eklemez; bu blok her iki durumu da karşılar.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'users_reminder_days_range'
       and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_reminder_days_range
      check (reminder_days between 0 and 90);
  end if;
end
$$;

comment on column public.users.reminder_days is
  'Hesap geneli hatırlatma varsayılanı (gün). Yeni abonelik formunu ön-doldurur; '
  'bildirim zamanlaması subscriptions.reminder_days_before üzerinden yapılır.';
