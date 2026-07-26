// ─── Supabase auth.users ile senkronize kullanıcı profili ───────────────────
export interface User {
  id: string;           // UUID — auth.users.id ile eşleşir
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

// ─── Fatura döngüsü seçenekleri ─────────────────────────────────────────────
export type BillingCycle = 'monthly' | 'yearly' | 'weekly' | 'quarterly';

// ─── Para birimi ─────────────────────────────────────────────────────────────
export type Currency = 'USD' | 'EUR' | 'TRY' | 'GBP';

// ─── Abonelik kaydı (DB row) ─────────────────────────────────────────────────
export interface Subscription {
  id: string;
  user_id: string;
  name: string;
  price: number;
  currency: Currency;
  billing_cycle: BillingCycle;
  next_payment_date: string;       // YYYY-MM-DD
  is_manual: boolean;              // false → Cron Job'un tarama kapsamında
  created_at: string;
  updated_at: string;
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
