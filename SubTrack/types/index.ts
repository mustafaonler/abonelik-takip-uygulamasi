// ─── Supabase auth.users ile senkronize kullanıcı profili ───────────────────
export interface User {
  id: string;           // UUID — auth.users.id ile eşleşir
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;   // ISO 8601
}

// ─── Fatura döngüsü seçenekleri ─────────────────────────────────────────────
export type BillingCycle = 'monthly' | 'yearly' | 'weekly' | 'quarterly';

// ─── Para birimi (genişletilebilir) ─────────────────────────────────────────
export type Currency = 'USD' | 'EUR' | 'TRY' | 'GBP';

// ─── Abonelik kaydı ─────────────────────────────────────────────────────────
export interface Subscription {
  id: string;
  user_id: string;
  name: string;                    // Örn: "Netflix", "Spotify"
  price: number;                   // Ondalıklı tutar
  currency: Currency;
  billing_cycle: BillingCycle;
  next_payment_date: string;       // ISO 8601 — YYYY-MM-DD
  is_manual: boolean;              // true → kullanıcı elle ekledi, false → mail'den parse edildi
  created_at: string;
  updated_at: string;
}

// ─── Abonelik oluşturma formu payload'u (id ve tarihler olmadan) ─────────────
export type CreateSubscriptionPayload = Omit<
  Subscription,
  'id' | 'user_id' | 'created_at' | 'updated_at'
>;

// ─── Abonelik güncelleme payload'u (kısmi) ──────────────────────────────────
export type UpdateSubscriptionPayload = Partial<CreateSubscriptionPayload>;
