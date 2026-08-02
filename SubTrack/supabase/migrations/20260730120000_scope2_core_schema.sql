-- ═══════════════════════════════════════════════════════════════════════════
-- SubTrack — Scope 2 / 1. Adım: Çekirdek Şema
--
-- Tablolar : categories, service_templates, subscriptions, contracts,
--            price_changes
-- Yardımcı : set_updated_at(), months_between(), calculate_early_termination_fee(),
--            advance_next_payment_date()
-- View     : v_subscriptions_enriched, v_dashboard_summary
--
-- NOT: Bu dosya auth akışına ve public.users tablosuna DOKUNMAZ.
--      Tüm user_id kolonları doğrudan auth.users(id)'yi referanslar; böylece
--      profil satırı (public.users) herhangi bir sebeple oluşmasa bile veri
--      bütünlüğü bozulmaz.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- ÖN KONTROL — Scope 2 öncesinden kalma tabloları yakala
--
-- Bu dosyadaki `create table if not exists`, aynı adlı ESKİ bir tablo varsa
-- onu sessizce atlar; sonra view'lar olmayan kolonlara bakıp patlar ve geriye
-- yarım uygulanmış bir şema kalır. O yüzden baştan, net bir hatayla duruyoruz.
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare
  v_legacy_subscriptions boolean;
begin
  select
    exists (
      select 1 from information_schema.tables
       where table_schema = 'public' and table_name = 'subscriptions'
    )
    and not exists (
      select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name   = 'subscriptions'
         and column_name  = 'monthly_amount'      -- Scope 2'nin imza kolonu
    )
  into v_legacy_subscriptions;

  if v_legacy_subscriptions then
    raise exception
      'Scope 2 öncesinden kalma bir public.subscriptions tablosu var ve şeması uyumsuz.'
      using hint =
        'Önce içinde veri var mı bak: select count(*) from public.subscriptions; '
        'Boşsa düşür: drop table public.subscriptions cascade; '
        'Veri varsa önce yedekle: alter table public.subscriptions rename to subscriptions_legacy; '
        'Sonra bu migration''ı tekrar çalıştır.';
  end if;
end
$$;

-- ─── ENUM tipleri ──────────────────────────────────────────────────────────
-- create type ... if not exists yok; DO bloğu ile idempotent yapıyoruz.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'billing_cycle') then
    create type public.billing_cycle as enum
      ('weekly', 'monthly', 'quarterly', 'semiannual', 'yearly');
  end if;

  if not exists (select 1 from pg_type where typname = 'currency') then
    create type public.currency as enum ('TRY', 'USD', 'EUR', 'GBP');
  end if;

  if not exists (select 1 from pg_type where typname = 'subscription_status') then
    create type public.subscription_status as enum
      ('active', 'trial', 'paused', 'cancelled', 'expired');
  end if;

  if not exists (select 1 from pg_type where typname = 'subscription_source') then
    -- manual      → kullanıcı elle girdi
    -- template    → hazır şablondan seçildi
    -- email_parse → backend cron mail'den çıkardı
    create type public.subscription_source as enum
      ('manual', 'template', 'email_parse');
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_method') then
    create type public.payment_method as enum
      ('credit_card', 'debit_card', 'bank_transfer', 'auto_payment', 'invoice', 'other');
  end if;

  if not exists (select 1 from pg_type where typname = 'penalty_type') then
    -- none                   → cayma bedeli yok
    -- fixed                  → sabit tutar (penalty_fixed_amount)
    -- remaining_discount     → kalan ay × aylık indirim + cihaz kalan bakiye  [TR operatör standardı]
    -- remaining_installments → kalan ay × aylık ücret (spor salonu vb.)
    create type public.penalty_type as enum
      ('none', 'fixed', 'remaining_discount', 'remaining_installments');
  end if;
end
$$;

-- ─── updated_at otomatiği ──────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) categories — kategori (user_id NULL ⇒ global/sistem kategorisi)
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,   -- NULL ⇒ global
  slug        text not null,
  name        text not null check (length(btrim(name)) between 1 and 60),
  icon        text,                       -- emoji veya ikon adı
  color       text,                       -- #RRGGBB
  sort_order  smallint not null default 100,
  created_at  timestamptz not null default now()
);

-- Global kategorilerde slug tekil; kullanıcı kategorilerinde kullanıcı başına tekil.
create unique index if not exists categories_global_slug_key
  on public.categories (slug) where user_id is null;
create unique index if not exists categories_user_slug_key
  on public.categories (user_id, slug) where user_id is not null;

comment on table public.categories is
  'Abonelik kategorileri. user_id NULL olan satırlar tüm kullanıcılara açıktır.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) service_templates — hazır şablon kataloğu (Scope 4 formları için)
--    Global ve salt-okunur; yazma yalnızca service_role ile yapılır.
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.service_templates (
  id                    uuid primary key default gen_random_uuid(),
  category_id           uuid references public.categories(id) on delete set null,
  slug                  text not null unique,
  name                  text not null,
  provider_name         text,                      -- 'Turkcell', 'MacFit' ...
  logo_url              text,
  color                 text,
  default_billing_cycle public.billing_cycle not null default 'monthly',
  default_currency      public.currency      not null default 'TRY',
  default_price         numeric(12,2) check (default_price is null or default_price >= 0),
  -- Taahhüt içeren hizmetler (operatör, spor salonu) için form ön-doldurma:
  supports_contract     boolean not null default false,
  default_penalty_type  public.penalty_type not null default 'none',
  is_active             boolean not null default true,
  sort_order            smallint not null default 100,
  created_at            timestamptz not null default now()
);

comment on column public.service_templates.default_price is
  'Referans fiyat. Piyasa fiyatları sık değiştiği için NULL bırakılabilir; '
  'form yalnızca isim/kategori/logo ön-doldurması yapar.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) subscriptions — ÇEKİRDEK TABLO
--    Her tekrar eden ödeme burada durur (dijital abonelik, operatör paketi,
--    spor salonu üyeliği, sigorta ...). Taahhüt detayı contracts'ta.
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id)          on delete cascade,
  category_id   uuid          references public.categories(id)        on delete set null,
  template_id   uuid          references public.service_templates(id) on delete set null,

  -- ── Kimlik ──
  name          text not null check (length(btrim(name)) between 1 and 120),
  provider_name text,
  description   text,
  logo_url      text,
  color         text,

  -- ── Fiyatlandırma ──
  price             numeric(12,2) not null check (price >= 0),
  currency          public.currency      not null default 'TRY',
  billing_cycle     public.billing_cycle not null default 'monthly',
  -- "2 ayda bir" gibi durumlar: cycle='monthly', interval=2
  billing_interval  smallint not null default 1 check (billing_interval between 1 and 24),

  -- Aylığa normalize edilmiş tutar — dashboard toplamları bunun üzerinden.
  -- STORED generated: her yazmada hesaplanır, okuma bedava.
  monthly_amount numeric(12,2) generated always as (
    (case billing_cycle
       when 'weekly'     then price * 52.0 / 12.0
       when 'monthly'    then price
       when 'quarterly'  then price / 3.0
       when 'semiannual' then price / 6.0
       when 'yearly'     then price / 12.0
     end) / billing_interval
  ) stored,

  -- ── Takvim ──
  start_date        date not null default current_date,
  next_payment_date date not null,
  last_payment_date date,
  trial_end_date    date,
  cancelled_at      date,

  -- ── Durum & köken ──
  status  public.subscription_status not null default 'active',
  source  public.subscription_source not null default 'manual',

  -- ── Ödeme & hatırlatma ──
  payment_method       public.payment_method,
  reminder_days_before smallint not null default 3
                       check (reminder_days_before between 0 and 90),
  notes                text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint subscriptions_trial_after_start
    check (trial_end_date is null or trial_end_date >= start_date),
  constraint subscriptions_next_payment_after_start
    check (next_payment_date >= start_date)
);

comment on column public.subscriptions.monthly_amount is
  'Aylığa normalize edilmiş tutar (generated). Farklı para birimleri toplanmadan '
  'önce currency bazında gruplanmalıdır — kur çevrimi bu katmanda YAPILMAZ.';

create index if not exists subscriptions_user_status_idx
  on public.subscriptions (user_id, status);
create index if not exists subscriptions_user_next_payment_idx
  on public.subscriptions (user_id, next_payment_date)
  where status in ('active', 'trial');
create index if not exists subscriptions_category_idx
  on public.subscriptions (category_id);

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) contracts — TAAHHÜT (1:1, opsiyonel)
--    Netflix'in satırı olmaz; Turkcell 24 ay / MacFit 12 ay olur.
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.contracts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  -- unique ⇒ bir aboneliğin en fazla bir aktif taahhüdü olur
  subscription_id uuid not null unique
                  references public.subscriptions(id) on delete cascade,

  start_date        date not null,
  end_date          date not null,
  commitment_months smallint not null check (commitment_months between 1 and 120),

  -- ── Cayma bedeli modeli ──
  penalty_type              public.penalty_type not null default 'none',
  penalty_fixed_amount      numeric(12,2) check (penalty_fixed_amount      is null or penalty_fixed_amount      >= 0),
  monthly_discount_amount   numeric(12,2) check (monthly_discount_amount   is null or monthly_discount_amount   >= 0),
  device_outstanding_amount numeric(12,2) not null default 0 check (device_outstanding_amount >= 0),
  penalty_cap_amount        numeric(12,2) check (penalty_cap_amount        is null or penalty_cap_amount        >= 0),

  auto_renew           boolean not null default false,
  -- Taahhüt bitince fiyat bu seviyeye çıkacak (fiyat artışı uyarısı için)
  post_contract_price  numeric(12,2) check (post_contract_price is null or post_contract_price >= 0),

  contract_number      text,     -- operatör sözleşme/abone no
  notes                text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint contracts_end_after_start check (end_date > start_date),
  -- Seçilen cayma modeli, gerektirdiği alanı dolu istemek zorunda:
  constraint contracts_penalty_fields_present check (
    case penalty_type
      when 'fixed'              then penalty_fixed_amount    is not null
      when 'remaining_discount' then monthly_discount_amount is not null
      else true
    end
  )
);

comment on table public.contracts is
  'Taahhüt kayıtları. subscriptions ile 1:1 (opsiyonel). Cayma bedeli '
  'calculate_early_termination_fee() ile hesaplanır.';
comment on column public.contracts.monthly_discount_amount is
  'Taahhüt karşılığı alınan AYLIK indirim tutarı. TR operatörlerinde cayma '
  'bedeli = kalan ay × bu tutar + cihaz kalan bakiyesi.';

create index if not exists contracts_user_end_date_idx
  on public.contracts (user_id, end_date);
create index if not exists contracts_subscription_idx
  on public.contracts (subscription_id);

drop trigger if exists contracts_set_updated_at on public.contracts;
create trigger contracts_set_updated_at
  before update on public.contracts
  for each row execute function public.set_updated_at();

-- ── user_id tutarlılığı: taahhüt, aboneliğin sahibine ait olmalı ───────────
create or replace function public.enforce_contract_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner
    from public.subscriptions
   where id = new.subscription_id;

  if v_owner is null then
    raise exception 'Abonelik bulunamadı: %', new.subscription_id;
  end if;

  if new.user_id <> v_owner then
    raise exception 'Taahhüt sahibi, aboneliğin sahibiyle aynı olmalı';
  end if;

  return new;
end;
$$;

drop trigger if exists contracts_enforce_owner on public.contracts;
create trigger contracts_enforce_owner
  before insert or update of user_id, subscription_id on public.contracts
  for each row execute function public.enforce_contract_owner();

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) price_changes — fiyat geçmişi (trigger ile otomatik dolar)
--    "Fiyatın %20 arttı" uyarısının veri kaynağı.
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.price_changes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  old_price       numeric(12,2) not null,
  new_price       numeric(12,2) not null,
  currency        public.currency not null,
  change_pct      numeric(7,2),          -- old_price = 0 ise NULL
  changed_at      timestamptz not null default now()
);

create index if not exists price_changes_subscription_idx
  on public.price_changes (subscription_id, changed_at desc);
create index if not exists price_changes_user_idx
  on public.price_changes (user_id, changed_at desc);

-- security definer: price_changes kullanıcı için salt-okunur bir denetim kaydıdır.
-- Kullanıcıya INSERT yetkisi verilmez, satırları yalnızca bu trigger yazar.
create or replace function public.log_price_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.price is distinct from old.price then
    insert into public.price_changes
      (user_id, subscription_id, old_price, new_price, currency, change_pct)
    values (
      new.user_id, new.id, old.price, new.price, new.currency,
      case when old.price > 0
           then round(((new.price - old.price) / old.price) * 100, 2)
           else null
      end
    );
  end if;
  return new;
end;
$$;

drop trigger if exists subscriptions_log_price_change on public.subscriptions;
create trigger subscriptions_log_price_change
  after update of price on public.subscriptions
  for each row execute function public.log_price_change();

-- ═══════════════════════════════════════════════════════════════════════════
-- 6) Yardımcı fonksiyonlar
-- ═══════════════════════════════════════════════════════════════════════════

-- İki tarih arasındaki TAM AY sayısı, yukarı yuvarlanmış (kalan gün varsa +1).
create or replace function public.months_remaining(p_from date, p_to date)
returns integer
language sql
immutable
as $$
  select greatest(
    0,
    (extract(year  from age(p_to, p_from))::int * 12)
  + (extract(month from age(p_to, p_from))::int)
  + (case when extract(day from age(p_to, p_from))::int > 0 then 1 else 0 end)
  );
$$;

-- ── Cayma bedeli ──────────────────────────────────────────────────────────
-- security invoker ⇒ RLS uygulanır, kullanıcı başkasının taahhüdünü hesaplayamaz.
create or replace function public.calculate_early_termination_fee(
  p_contract_id uuid,
  p_as_of       date default current_date
)
returns numeric
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  c        public.contracts%rowtype;
  v_months integer;
  v_fee    numeric(12,2);
  v_sub_monthly numeric(12,2);
begin
  select * into c from public.contracts where id = p_contract_id;
  if not found then
    return null;                        -- görünmüyor (RLS) veya yok
  end if;

  -- Taahhüt bittiyse cayma bedeli sıfırdır.
  if p_as_of >= c.end_date then
    return 0;
  end if;

  v_months := public.months_remaining(p_as_of, c.end_date);

  case c.penalty_type
    when 'none' then
      v_fee := 0;

    when 'fixed' then
      v_fee := coalesce(c.penalty_fixed_amount, 0);

    when 'remaining_discount' then
      v_fee := (v_months * coalesce(c.monthly_discount_amount, 0))
             + c.device_outstanding_amount;

    when 'remaining_installments' then
      select monthly_amount into v_sub_monthly
        from public.subscriptions where id = c.subscription_id;
      v_fee := (v_months * coalesce(v_sub_monthly, 0))
             + c.device_outstanding_amount;

    else
      -- penalty_type enum'una ileride değer eklenirse CASE_NOT_FOUND yerine 0.
      v_fee := 0;
  end case;

  -- Yasal/sözleşmesel üst sınır
  if c.penalty_cap_amount is not null then
    v_fee := least(v_fee, c.penalty_cap_amount);
  end if;

  return round(v_fee, 2);
end;
$$;

comment on function public.calculate_early_termination_fee(uuid, date) is
  'Verilen tarihte sözleşmeden çıkılırsa ödenecek cayma bedeli. '
  'Taahhüt bitmişse 0, kayıt görünmüyorsa NULL döner.';

-- ── Bir sonraki ödeme tarihini ilerlet (cron / ödeme işaretleme için) ─────
create or replace function public.advance_next_payment_date(p_subscription_id uuid)
returns date
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  s        public.subscriptions%rowtype;
  v_step   interval;
  v_next   date;
begin
  select * into s from public.subscriptions where id = p_subscription_id;
  if not found then
    return null;
  end if;

  v_step := (case s.billing_cycle
               when 'weekly'     then interval '1 week'
               when 'monthly'    then interval '1 month'
               when 'quarterly'  then interval '3 months'
               when 'semiannual' then interval '6 months'
               when 'yearly'     then interval '1 year'
             end) * s.billing_interval::double precision;

  -- Her çağrıda EN AZ bir dönem ilerle (ödeme alındı demek).
  v_next := (s.next_payment_date + v_step)::date;

  -- Sonra, geçmişte kalmış dönemleri bugüne kadar toparla
  -- (uygulama/cron günlerce çalışmamış olabilir).
  while v_next <= current_date loop
    v_next := (v_next + v_step)::date;
  end loop;

  update public.subscriptions
     set last_payment_date = s.next_payment_date,
         next_payment_date = v_next
   where id = p_subscription_id;

  return v_next;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7) View'lar — security_invoker ⇒ alttaki tabloların RLS'i geçerli kalır
-- ═══════════════════════════════════════════════════════════════════════════

drop view if exists public.v_subscriptions_enriched;
create view public.v_subscriptions_enriched
with (security_invoker = true) as
select
  s.*,
  cat.name  as category_name,
  cat.icon  as category_icon,
  cat.color as category_color,

  (s.next_payment_date - current_date)                as days_until_payment,

  ct.id                                               as contract_id,
  ct.start_date                                       as contract_start_date,
  ct.end_date                                         as contract_end_date,
  ct.commitment_months                                as contract_months,
  ct.auto_renew                                       as contract_auto_renew,
  ct.post_contract_price                              as contract_post_price,
  (ct.end_date - current_date)                        as contract_days_left,

  -- Progress bar için 0–100 arası doluluk yüzdesi
  case
    when ct.id is null then null
    else least(100, greatest(0, round(
      ((current_date - ct.start_date)::numeric
       / nullif((ct.end_date - ct.start_date)::numeric, 0)) * 100, 1)))
  end                                                 as contract_progress_pct,

  case when ct.id is null then null
       else public.calculate_early_termination_fee(ct.id)
  end                                                 as early_termination_fee

from public.subscriptions s
left join public.categories cat on cat.id = s.category_id
left join public.contracts  ct  on ct.subscription_id = s.id;

comment on view public.v_subscriptions_enriched is
  'Dashboard ve liste ekranının tek okuma kaynağı: abonelik + kategori + '
  'taahhüt ilerlemesi + anlık cayma bedeli.';

-- Aylık/yıllık toplam — para birimi bazında gruplu (kur çevrimi yapılmaz).
drop view if exists public.v_dashboard_summary;
create view public.v_dashboard_summary
with (security_invoker = true) as
select
  s.user_id,
  s.currency,
  count(*)                                              as active_count,
  coalesce(sum(s.monthly_amount), 0)                    as monthly_total,
  coalesce(sum(s.monthly_amount) * 12, 0)               as yearly_total,
  count(*) filter (where s.next_payment_date <= current_date + 7)  as due_within_7_days,
  count(*) filter (where s.next_payment_date <= current_date + 30) as due_within_30_days
from public.subscriptions s
where s.status in ('active', 'trial')
group by s.user_id, s.currency;
