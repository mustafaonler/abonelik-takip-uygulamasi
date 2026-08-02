-- ═══════════════════════════════════════════════════════════════════════════
-- SubTrack — Scope 2 geri alma
--
-- ⚠️  VERİ KAYBETTİRİR. Tüm abonelik, taahhüt ve fiyat geçmişi silinir.
--     Yalnızca geliştirme ortamında, şemayı sıfırdan kurmak için kullanın.
--
-- public.users ve auth şemasına DOKUNMAZ.
-- 20260730120300_users_rls_optional.sql uygulandıysa, oradaki politikalar
-- bu dosyayla kaldırılmaz (bilinçli — auth akışını bozmamak için).
-- ═══════════════════════════════════════════════════════════════════════════

drop view if exists public.v_dashboard_summary;
drop view if exists public.v_subscriptions_enriched;

drop function if exists public.calculate_early_termination_fee(uuid, date);
drop function if exists public.advance_next_payment_date(uuid);
drop function if exists public.months_remaining(date, date);

-- Tablolar (bağımlılık sırasına göre; cascade trigger'ları da düşürür)
drop table if exists public.price_changes     cascade;
drop table if exists public.contracts         cascade;
drop table if exists public.subscriptions     cascade;
drop table if exists public.service_templates cascade;
drop table if exists public.categories        cascade;

drop function if exists public.log_price_change();
drop function if exists public.enforce_contract_owner();
drop function if exists public.set_updated_at();

drop type if exists public.penalty_type;
drop type if exists public.payment_method;
drop type if exists public.subscription_source;
drop type if exists public.subscription_status;
drop type if exists public.currency;
drop type if exists public.billing_cycle;
