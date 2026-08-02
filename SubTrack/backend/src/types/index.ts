// ═══════════════════════════════════════════════════════════════════════════
// SubTrack Backend — Veritabanı tipleri
// Kaynak: ../../supabase/migrations/20260730120000_scope2_core_schema.sql
// Frontend'deki types/index.ts ile aynı şemayı yansıtır; şema değişirse
// İKİSİ BİRDEN güncellenmelidir.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Supabase auth.users ile senkronize kullanıcı profili ───────────────────
export interface User {
  id: string;           // UUID — auth.users.id ile eşleşir
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

// ─── ENUM karşılıkları ──────────────────────────────────────────────────────
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

export type PenaltyType =
  | 'none'
  | 'fixed'
  | 'remaining_discount'
  | 'remaining_installments';

// ─── Abonelik (DB row) ──────────────────────────────────────────────────────
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
  billing_interval: number;

  /** DB tarafından üretilir — INSERT/UPDATE gövdesine KOYMA. */
  readonly monthly_amount: number;

  start_date: string;
  next_payment_date: string;
  last_payment_date: string | null;
  trial_end_date: string | null;
  cancelled_at: string | null;

  status: SubscriptionStatus;
  /** 'email_parse' → Cron Job'un ürettiği kayıt. */
  source: SubscriptionSource;

  payment_method: PaymentMethod | null;
  reminder_days_before: number;
  notes: string | null;

  created_at: string;
  updated_at: string;
}

// ─── Taahhüt (subscriptions ile 1:1) ────────────────────────────────────────
export interface Contract {
  id: string;
  user_id: string;
  subscription_id: string;

  start_date: string;
  end_date: string;
  commitment_months: number;

  penalty_type: PenaltyType;
  penalty_fixed_amount: number | null;
  monthly_discount_amount: number | null;
  device_outstanding_amount: number;
  penalty_cap_amount: number | null;

  auto_renew: boolean;
  post_contract_price: number | null;

  contract_number: string | null;
  notes: string | null;

  created_at: string;
  updated_at: string;
}

// ─── Fiyat değişim kaydı ────────────────────────────────────────────────────
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

// ─── Cron Job'un mail'den ürettiği parse edilmiş abonelik ───────────────────
export interface ParsedSubscription {
  name: string;
  price: number;
  currency: Currency;
  billing_cycle: BillingCycle;
  next_payment_date: string;
}

// ─── Gmail OAuth token'ları (Supabase'de saklanacak) ────────────────────────
export interface GmailToken {
  user_id: string;
  access_token: string;
  refresh_token: string;
  expiry_date: number;             // Unix timestamp (ms)
}

// ─── Express request'e user eklemek için genişletme ─────────────────────────
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}
