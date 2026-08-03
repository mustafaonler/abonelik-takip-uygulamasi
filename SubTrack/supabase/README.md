# SubTrack — Veritabanı (Scope 2)

Şema versiyonlanmış SQL dosyalarında tutulur. Dashboard'dan elle tablo
oluşturmayın — değişiklikleri buraya yazın ki takım arkadaşınızla aynı şemada
kalabilesiniz.

## Dosyalar — bu sırayla çalıştırın

| # | Dosya | İçerik |
|---|-------|--------|
| 1 | `migrations/20260730120000_scope2_core_schema.sql` | Enum'lar, 5 tablo, index, trigger, fonksiyon, view |
| 2 | `migrations/20260730120100_scope2_rls_policies.sql` | RLS + politikalar |
| 3 | `migrations/20260730120200_scope2_seed_catalog.sql` | 10 kategori + 46 hazır hizmet şablonu |
| 4 | `migrations/20260730120300_users_rls_optional.sql` | ⚠️ `public.users` RLS — **önce dosyanın başındaki notu okuyun** |

1–3 idempotenttir, tekrar çalıştırılabilir. 4. dosya auth akışına dokunan tek
migration olduğu için ayrıldı.

## ⚠️ Başlamadan önce: eski `subscriptions` tablosu

Scope 2 öncesinde elle kurulmuş bir `public.subscriptions` tablosu var. Şeması
yeni tabloyla uyumsuz ve `create table if not exists` onu sessizce atlayacağı
için migration yarım kalır. 1. dosyadaki ön kontrol bunu yakalayıp net bir
hatayla durur — ama önce şunu temizlemen gerekiyor:

```sql
select count(*) from public.subscriptions;
```

Sonuç `0` ise (beklenen durum — CRUD henüz yazılmadı) düşür:

```sql
drop table public.subscriptions cascade;
```

İçinde tutmak istediğin veri varsa düşürmek yerine yeniden adlandır:

```sql
alter table public.subscriptions rename to subscriptions_legacy;
```

## Nasıl uygulanır

**Seçenek A — Supabase Dashboard (hızlı yol)**
SQL Editor → dosya içeriğini yapıştır → Run. Sırayla, tek tek.

**Seçenek B — Supabase CLI (önerilen)**

```bash
npx supabase link --project-ref <PROJE_REF>
```

```bash
npx supabase db push
```

## Şema özeti

```
auth.users
   └── subscriptions ──┬── contracts        (1:1, opsiyonel — taahhüt)
                       └── price_changes    (1:N, trigger ile otomatik)
        ▲     ▲
        │     └── service_templates  (global katalog, salt-okunur)
        └──────── categories         (global + kullanıcıya özel)
```

**Neden `contracts` ayrı tabloda?** Netflix'in taahhüdü yok, Turkcell'in var.
Cayma alanlarını `subscriptions`'a gömseydik her dijital abonelik satırı 6 boş
kolon taşırdı; tamamen ayırsaydık "aylık toplam harcama" sorgusu ikiye
bölünürdü. Ödeme/tekrarlama mantığı tek yerde, taahhüt detayı yanında duruyor.

### Öne çıkan alanlar

- `subscriptions.monthly_amount` — **generated column**. Haftalık/yıllık her şeyi
  aylığa normalize eder (`billing_interval` dâhil). Dashboard toplamları bunun
  üzerinden gider. INSERT/UPDATE gövdesine koymayın, DB üretir.
- `contracts.monthly_discount_amount` — taahhüt karşılığı alınan aylık indirim.
  TR operatörlerinde cayma bedelinin temeli.
- `price_changes` — fiyat her değiştiğinde trigger doldurur. "Fiyatın %20 arttı"
  uyarısının veri kaynağı. Kullanıcı yazamaz, sadece okur.

### Fonksiyonlar

```sql
-- Bugün çıkılırsa ödenecek cayma bedeli (taahhüt bittiyse 0)
select public.calculate_early_termination_fee('<contract_id>');

-- İleri bir tarihte çıkılsa ne olurdu?
select public.calculate_early_termination_fee('<contract_id>', '2027-03-01');

-- Ödeme alındı → bir sonraki döneme ilerlet
select public.advance_next_payment_date('<subscription_id>');
```

### View'lar (Scope 3 buradan beslenir)

- `v_subscriptions_enriched` — abonelik + kategori + taahhüt ilerleme yüzdesi
  (`contract_progress_pct`, progress bar için 0–100) + anlık cayma bedeli.
- `v_dashboard_summary` — **para birimi bazında** aylık/yıllık toplam ve
  7/30 gün içinde ödemesi gelen sayısı.

> Kur çevrimi bilinçli olarak yapılmıyor. TRY ve USD tutarlarını toplamak sessizce
> yanlış rakam üretir; `v_dashboard_summary` bu yüzden `currency` bazında gruplu
> döner. Tek bir toplam gerekirse kur katmanını ayrıca kurmalıyız.

## Uygulama sonrası doğrulama

**1. Her tabloda RLS açık mı?** Beş satırın beşi de `true` olmalı:

```sql
select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relname in ('categories','service_templates','subscriptions','contracts','price_changes');
```

**2. Politikalar yerinde mi?**

```sql
select tablename, policyname, cmd from pg_policies where schemaname = 'public' order by tablename, cmd;
```

**3. Seed geldi mi?** 10 kategori + 46 şablon:

```sql
select (select count(*) from public.categories where user_id is null) as kategori, (select count(*) from public.service_templates) as sablon;
```

**4. İzolasyon gerçekten çalışıyor mu?**
Asıl test budur — RLS'i "açık" görmek yetmez. Uygulamadan iki farklı Google
hesabıyla giriş yapıp birer abonelik ekleyin, sonra her hesapta listeyi çekin:
her kullanıcı yalnızca kendi kaydını görmeli. `service_role` anahtarıyla yapılan
sorgular RLS'i **bypass eder**, bu testi anon/authenticated anahtarla yapın.

## Geri alma

`rollback_scope2.sql` Scope 2'nin oluşturduğu her şeyi düşürür.
**Veri kaybettirir**, yalnızca geliştirme ortamında kullanın.
