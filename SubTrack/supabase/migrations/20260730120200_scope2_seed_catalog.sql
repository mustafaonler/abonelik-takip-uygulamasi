-- ═══════════════════════════════════════════════════════════════════════════
-- SubTrack — Scope 2 / 3. Adım: Global katalog seed'i
--
-- Kategoriler + hazır hizmet şablonları (Scope 4'teki "şablondan ekle" akışı).
-- Idempotent: slug üzerinden upsert, tekrar tekrar çalıştırılabilir.
--
-- default_price bilinçli olarak NULL bırakıldı — piyasa fiyatları sürekli
-- değişiyor, uydurulmuş bir fiyat yanlış bütçe analizi üretir. Şablon
-- isim/kategori/renk/taahhüt-desteği ön-doldurması yapar, tutarı kullanıcı girer.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Kategoriler (global: user_id NULL) ────────────────────────────────────
insert into public.categories (user_id, slug, name, icon, color, sort_order) values
  (null, 'streaming',  'Dijital & Yayın',   '🎬', '#7c3aed', 10),
  (null, 'music',      'Müzik',             '🎧', '#ec4899', 20),
  (null, 'telecom',    'Operatör & İnternet','📱', '#0ea5e9', 30),
  (null, 'fitness',    'Spor & Sağlık',     '🏋️', '#22c55e', 40),
  (null, 'software',   'Yazılım & Bulut',   '💻', '#f59e0b', 50),
  (null, 'utility',    'Fatura & Aidat',    '🏠', '#64748b', 60),
  (null, 'insurance',  'Sigorta',           '🛡️', '#ef4444', 70),
  (null, 'education',  'Eğitim',            '📚', '#14b8a6', 80),
  (null, 'gaming',     'Oyun',              '🎮', '#8b5cf6', 90),
  (null, 'other',      'Diğer',             '📦', '#94a3b8', 999)
on conflict (slug) where user_id is null
do update set
  name       = excluded.name,
  icon       = excluded.icon,
  color      = excluded.color,
  sort_order = excluded.sort_order;

-- ─── Hizmet şablonları ─────────────────────────────────────────────────────
-- supports_contract = true olanlar, form akışında taahhüt adımını açar.
insert into public.service_templates
  (slug, name, provider_name, category_id, default_billing_cycle,
   supports_contract, default_penalty_type, sort_order)
select
  v.slug, v.name, v.provider_name,
  (select id from public.categories c where c.slug = v.category_slug and c.user_id is null),
  v.cycle::public.billing_cycle,
  v.supports_contract,
  v.penalty::public.penalty_type,
  v.sort_order
from (values
  -- ── Dijital & Yayın ──
  ('netflix',        'Netflix',            'Netflix',        'streaming', 'monthly', false, 'none',  10),
  ('disney-plus',    'Disney+',            'Disney',         'streaming', 'monthly', false, 'none',  20),
  ('amazon-prime',   'Amazon Prime Video', 'Amazon',         'streaming', 'monthly', false, 'none',  30),
  ('blutv',          'BluTV',              'BluTV',          'streaming', 'monthly', false, 'none',  40),
  ('exxen',          'Exxen',              'Exxen',          'streaming', 'monthly', false, 'none',  50),
  ('tabii',          'tabii',              'TRT',            'streaming', 'monthly', false, 'none',  60),
  ('youtube-premium','YouTube Premium',    'Google',         'streaming', 'monthly', false, 'none',  70),
  ('mubi',           'MUBI',               'MUBI',           'streaming', 'monthly', false, 'none',  80),

  -- ── Müzik ──
  ('spotify',        'Spotify',            'Spotify',        'music',     'monthly', false, 'none',  10),
  ('apple-music',    'Apple Music',        'Apple',          'music',     'monthly', false, 'none',  20),
  ('youtube-music',  'YouTube Music',      'Google',         'music',     'monthly', false, 'none',  30),
  ('fizy',           'fizy',               'Turkcell',       'music',     'monthly', false, 'none',  40),

  -- ── Operatör & İnternet (taahhütlü) ──
  ('turkcell-mobil',   'Turkcell Mobil Paket',   'Turkcell',       'telecom', 'monthly', true, 'remaining_discount', 10),
  ('vodafone-mobil',   'Vodafone Mobil Paket',   'Vodafone',       'telecom', 'monthly', true, 'remaining_discount', 20),
  ('turk-telekom-mobil','Türk Telekom Mobil',    'Türk Telekom',   'telecom', 'monthly', true, 'remaining_discount', 30),
  ('superonline',      'Turkcell Superonline',   'Turkcell',       'telecom', 'monthly', true, 'remaining_discount', 40),
  ('turk-telekom-fiber','Türk Telekom Fiber',    'Türk Telekom',   'telecom', 'monthly', true, 'remaining_discount', 50),
  ('turknet',          'TurkNet',                'TurkNet',        'telecom', 'monthly', true, 'remaining_discount', 60),
  ('vodafone-net',     'Vodafone Net',           'Vodafone',       'telecom', 'monthly', true, 'remaining_discount', 70),
  ('millenicom',       'Millenicom',             'Millenicom',     'telecom', 'monthly', true, 'remaining_discount', 80),

  -- ── Spor & Sağlık (taahhütlü) ──
  ('macfit',         'MACFit',             'MACFit',         'fitness',   'monthly', true,  'remaining_installments', 10),
  ('fitness-time',   'Fitness Time',       'Fitness Time',   'fitness',   'monthly', true,  'remaining_installments', 20),
  ('mars-athletic',  'Mars Athletic',      'Mars Athletic',  'fitness',   'monthly', true,  'remaining_installments', 30),
  ('gym-other',      'Spor Salonu (Diğer)', null,            'fitness',   'monthly', true,  'remaining_installments', 90),

  -- ── Yazılım & Bulut ──
  ('icloud',         'iCloud+',            'Apple',          'software',  'monthly', false, 'none',  10),
  ('google-one',     'Google One',         'Google',         'software',  'monthly', false, 'none',  20),
  ('microsoft-365',  'Microsoft 365',      'Microsoft',      'software',  'yearly',  false, 'none',  30),
  ('adobe-cc',       'Adobe Creative Cloud','Adobe',         'software',  'monthly', false, 'none',  40),
  ('chatgpt-plus',   'ChatGPT Plus',       'OpenAI',         'software',  'monthly', false, 'none',  50),
  ('claude-pro',     'Claude Pro',         'Anthropic',      'software',  'monthly', false, 'none',  60),
  ('dropbox',        'Dropbox',            'Dropbox',        'software',  'monthly', false, 'none',  70),
  ('github-copilot', 'GitHub Copilot',     'GitHub',         'software',  'monthly', false, 'none',  80),

  -- ── Oyun ──
  ('xbox-game-pass', 'Xbox Game Pass',     'Microsoft',      'gaming',    'monthly', false, 'none',  10),
  ('playstation-plus','PlayStation Plus',  'Sony',           'gaming',    'monthly', false, 'none',  20),
  ('nintendo-online','Nintendo Switch Online','Nintendo',    'gaming',    'yearly',  false, 'none',  30),

  -- ── Fatura & Aidat ──
  ('elektrik',       'Elektrik Faturası',  null,             'utility',   'monthly', false, 'none',  10),
  ('dogalgaz',       'Doğalgaz Faturası',  null,             'utility',   'monthly', false, 'none',  20),
  ('su',             'Su Faturası',        null,             'utility',   'monthly', false, 'none',  30),
  ('aidat',          'Site/Apartman Aidatı', null,           'utility',   'monthly', false, 'none',  40),

  -- ── Sigorta ──
  ('kasko',          'Kasko',              null,             'insurance', 'yearly',  false, 'none',  10),
  ('trafik-sigortasi','Trafik Sigortası',  null,             'insurance', 'yearly',  false, 'none',  20),
  ('saglik-sigortasi','Sağlık Sigortası',  null,             'insurance', 'yearly',  false, 'none',  30),
  ('dask',           'DASK',               null,             'insurance', 'yearly',  false, 'none',  40),

  -- ── Eğitim ──
  ('udemy',          'Udemy',              'Udemy',          'education', 'monthly', false, 'none',  10),
  ('duolingo',       'Duolingo Super',     'Duolingo',       'education', 'yearly',  false, 'none',  20),
  ('coursera',       'Coursera Plus',      'Coursera',       'education', 'yearly',  false, 'none',  30)
) as v(slug, name, provider_name, category_slug, cycle, supports_contract, penalty, sort_order)
on conflict (slug) do update set
  name                  = excluded.name,
  provider_name         = excluded.provider_name,
  category_id           = excluded.category_id,
  default_billing_cycle = excluded.default_billing_cycle,
  supports_contract     = excluded.supports_contract,
  default_penalty_type  = excluded.default_penalty_type,
  sort_order            = excluded.sort_order;
