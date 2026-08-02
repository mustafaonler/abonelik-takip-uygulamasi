// ═══════════════════════════════════════════════════════════════════════════
// SubTrack — Veritabanı tipleri
// Kaynak: supabase/migrations/20260730120000_scope2_core_schema.sql
// Şema değişirse bu dosya da güncellenmelidir.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Supabase auth.users ile senkronize kullanıcı profili ───────────────────
export interface User {
  id: string;           // UUID — auth.users.id ile eşleşir
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;   // ISO 8601
}

// ─── ENUM karşılıkları (public.* enum tipleri) ─────────────────────────────
export type BillingCycle =
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'semiannual'
  | 'yearly';

export type Currency = 'TRY' | 'USD' | 'EUR' | 'GBP';

export type SubscriptionStatus =
  | 'active'
  | 'trial'
  | 'paused'
  | 'cancelled'
  | 'expired';

export type SubscriptionSource = 'manual' | 'template' | 'email_parse';

export type PaymentMethod =
  | 'credit_card'
  | 'debit_card'
  | 'bank_transfer'
  | 'auto_payment'
  | 'invoice'
  | 'other';

/**
 * Cayma bedeli modeli.
 * - none                   → cayma bedeli yok
 * - fixed                  → sabit tutar
 * - remaining_discount     → kalan ay × aylık indirim + cihaz bakiyesi (TR operatör)
 * - remaining_installments → kalan ay × aylık ücret (spor salonu vb.)
 */
export type PenaltyType =
  | 'none'
  | 'fixed'
  | 'remaining_discount'
  | 'remaining_installments';

// ─── Kategori ───────────────────────────────────────────────────────────────
export interface Category {
  id: string;
  user_id: string | null;   // null ⇒ global/sistem kategorisi
  slug: string;
  name: string;
  icon: string | null;
  color: string | null;
  sort_order: number;
  created_at: string;
}

// ─── Hazır hizmet şablonu (salt-okunur katalog) ────────────────────────────
export interface ServiceTemplate {
  id: string;
  category_id: string | null;
  slug: string;
  name: string;
  provider_name: string | null;
  logo_url: string | null;
  color: string | null;
  default_billing_cycle: BillingCycle;
  default_currency: Currency;
  default_price: number | null;
  supports_contract: boolean;      // true ⇒ formda taahhüt adımını göster
  default_penalty_type: PenaltyType;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

// ─── Abonelik (çekirdek tablo) ──────────────────────────────────────────────
export interface Subscription {
  id: string;
  user_id: string;
  category_id: string | null;
  template_id: string | null;

  name: string;
  provider_name: string | null;
  description: string | null;
  logo_url: string | null;
  color: string | null;

  price: number;
  currency: Currency;
  billing_cycle: BillingCycle;
  billing_interval: number;        // "2 ayda bir" ⇒ cycle='monthly', interval=2

  /** Aylığa normalize edilmiş tutar. DB tarafından üretilir — YAZILAMAZ. */
  readonly monthly_amount: number;

  start_date: string;              // YYYY-MM-DD
  next_payment_date: string;
  last_payment_date: string | null;
  trial_end_date: string | null;
  cancelled_at: string | null;

  status: SubscriptionStatus;
  source: SubscriptionSource;

  payment_method: PaymentMethod | null;
  reminder_days_before: number;
  notes: string | null;

  created_at: string;
  updated_at: string;
}

// ─── Taahhüt (subscriptions ile 1:1, opsiyonel) ────────────────────────────
export interface Contract {
  id: string;
  user_id: string;
  subscription_id: string;

  start_date: string;
  end_date: string;
  commitment_months: number;

  penalty_type: PenaltyType;
  penalty_fixed_amount: number | null;
  /** Taahhüt karşılığı alınan aylık indirim — cayma hesabının temeli. */
  monthly_discount_amount: number | null;
  device_outstanding_amount: number;
  penalty_cap_amount: number | null;

  auto_renew: boolean;
  /** Taahhüt bitince geçilecek fiyat — fiyat artışı uyarısı için. */
  post_contract_price: number | null;

  contract_number: string | null;
  notes: string | null;

  created_at: string;
  updated_at: string;
}

// ─── Fiyat değişim kaydı (trigger ile otomatik, salt-okunur) ───────────────
export interface PriceChange {
  id: string;
  user_id: string;
  subscription_id: string;
  old_price: number;
  new_price: number;
  currency: Currency;
  change_pct: number | null;
  changed_at: string;
}

// ─── v_subscriptions_enriched — liste & dashboard okuma kaynağı ────────────
export interface SubscriptionEnriched extends Subscription {
  category_name: string | null;
  category_icon: string | null;
  category_color: string | null;

  /** next_payment_date − bugün (gün). Negatif ⇒ ödeme gecikmiş. */
  days_until_payment: number;

  contract_id: string | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  contract_months: number | null;
  contract_auto_renew: boolean | null;
  contract_post_price: number | null;
  contract_days_left: number | null;
  /** 0–100 arası taahhüt doluluk yüzdesi (progress bar). */
  contract_progress_pct: number | null;
  /** Bugün çıkılırsa ödenecek cayma bedeli. */
  early_termination_fee: number | null;
}

// ─── v_dashboard_summary — para birimi bazında toplamlar ───────────────────
export interface DashboardSummary {
  user_id: string;
  currency: Currency;
  active_count: number;
  monthly_total: number;
  yearly_total: number;
  due_within_7_days: number;
  due_within_30_days: number;
}

// ─── Form payload'ları (Scope 4) ────────────────────────────────────────────
/** DB'nin ürettiği alanlar (id, user_id, monthly_amount, zaman damgaları) hariç. */
export type CreateSubscriptionPayload = Omit<
  Subscription,
  'id' | 'user_id' | 'monthly_amount' | 'created_at' | 'updated_at'
>;

export type UpdateSubscriptionPayload = Partial<CreateSubscriptionPayload>;

export type CreateContractPayload = Omit<
  Contract,
  'id' | 'user_id' | 'created_at' | 'updated_at'
>;

export type UpdateContractPayload = Partial<
  Omit<CreateContractPayload, 'subscription_id'>
>;
