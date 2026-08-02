import type { BillingCycle, Currency } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// Biçimlendirme ve tarih yardımcıları
//
// Tarihler her yerde 'YYYY-MM-DD' (PostgreSQL `date`) olarak taşınır.
// Kullanıcıya 'GG.AA.YYYY' gösterilir.
// ═══════════════════════════════════════════════════════════════════════════

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  TRY: '₺',
  USD: '$',
  EUR: '€',
  GBP: '£',
};

export function formatCurrency(value: number, currency: Currency = 'TRY'): string {
  const amount = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Hermes'te Intl yoksa sessizce bozulmak yerine basit biçime düş.
    return `${CURRENCY_SYMBOL[currency] ?? ''}${amount.toFixed(2)}`;
  }
}

// ─── ISO ↔ Date ────────────────────────────────────────────────────────────

/**
 * 'YYYY-MM-DD' → yerel Date.
 * new Date('2026-03-12') UTC olarak ayrıştırılır ve negatif saat diliminde bir
 * gün geri kayar; bu yüzden parçalardan kuruyoruz.
 */
export function parseISODate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;

  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  // 31 Şubat gibi taşan tarihleri ele.
  if (date.getMonth() !== Number(m) - 1) return null;
  return date;
}

/** Date → 'YYYY-MM-DD' (yerel saat dilimine göre, toISOString DEĞİL). */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const targetDay = result.getDate();

  result.setMonth(result.getMonth() + months);

  // 31 Ocak + 1 ay → 3 Mart olmasın; ayın son gününe sabitle.
  if (result.getDate() !== targetDay) result.setDate(0);
  return result;
}

export function addMonthsISO(iso: string, months: number): string | null {
  const date = parseISODate(iso);
  if (!date) return null;
  return toISODate(addMonths(date, months));
}

/** İki ISO tarih arasındaki gün farkı (b − a). */
export function daysBetweenISO(a: string, b: string): number | null {
  const from = parseISODate(a);
  const to = parseISODate(b);
  if (!from || !to) return null;
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

// ─── Kullanıcıya gösterim ──────────────────────────────────────────────────

/** 'YYYY-MM-DD' → '12 Mart' (withYear ise '12 Mart 2026'). */
export function formatDate(iso: string, withYear = false): string {
  const date = parseISODate(iso);
  if (!date) return iso;

  try {
    return date.toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'long',
      ...(withYear ? { year: 'numeric' } : {}),
    });
  } catch {
    return formatDateInput(iso);
  }
}

/** 'YYYY-MM-DD' → '12.03.2026' (form alanları için). */
export function formatDateInput(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return iso;
  const [, y, m, d] = match;
  return `${d}.${m}.${y}`;
}

/** '12.03.2026' → 'YYYY-MM-DD'. Geçersizse null. */
export function parseDateInput(value: string): string | null {
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value.trim());
  if (!match) return null;

  const [, d, m, y] = match;
  const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  return parseISODate(iso) ? iso : null;
}

/** Kullanıcı yazarken '12032026' → '12.03.2026' maskesi uygular. */
export function maskDateInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)];
  return parts.filter(Boolean).join('.');
}

export function formatRelativeDays(days: number): string {
  if (days < 0) return `${Math.abs(days)} gün gecikti`;
  if (days === 0) return 'Bugün';
  if (days === 1) return 'Yarın';
  return `${days} gün sonra`;
}

export function formatRemaining(days: number): string {
  if (days <= 0) return 'Süresi doldu';
  if (days <= 45) return `${days} gün kaldı`;
  return `${Math.round(days / 30)} ay kaldı`;
}

// ─── Fatura döngüsü ────────────────────────────────────────────────────────

export const CYCLE_LABEL: Record<BillingCycle, string> = {
  weekly: 'hafta',
  monthly: 'ay',
  quarterly: '3 ay',
  semiannual: '6 ay',
  yearly: 'yıl',
};

export const CYCLE_OPTIONS: { value: BillingCycle; label: string }[] = [
  { value: 'weekly', label: 'Haftalık' },
  { value: 'monthly', label: 'Aylık' },
  { value: 'quarterly', label: '3 Aylık' },
  { value: 'semiannual', label: '6 Aylık' },
  { value: 'yearly', label: 'Yıllık' },
];

export function formatCycle(cycle: BillingCycle, interval = 1): string {
  const base = CYCLE_LABEL[cycle] ?? 'ay';
  return interval > 1 ? `${interval} ${base}` : base;
}

/**
 * Bir dönemlik tutarı aylığa normalize eder.
 * subscriptions.monthly_amount generated column'unun JS karşılığı — canlı
 * önizleme için. Kaydedilen değeri her zaman VERİTABANI üretir.
 */
export function toMonthlyAmount(
  price: number,
  cycle: BillingCycle,
  interval = 1,
): number {
  const perCycle =
    cycle === 'weekly'     ? (price * 52) / 12 :
    cycle === 'monthly'    ? price :
    cycle === 'quarterly'  ? price / 3 :
    cycle === 'semiannual' ? price / 6 :
    /* yearly */             price / 12;

  return perCycle / Math.max(1, interval);
}

/**
 * Kullanıcının girdiği tutarı sayıya çevirir.
 *   '229,99'    → 229.99   (TR ondalık)
 *   '229.99'    → 229.99   (tek nokta = ondalık)
 *   '1.234,56'  → 1234.56  (virgül varsa noktalar binlik ayıracıdır)
 *   '1.234.567' → 1234567  (birden fazla nokta = binlik ayıracı)
 */
export function parseAmountInput(value: string): number | null {
  const raw = value.trim().replace(/\s/g, '');
  if (!raw) return null;

  let cleaned: string;
  if (raw.includes(',')) {
    cleaned = raw.replace(/\./g, '').replace(',', '.');
  } else {
    const dotCount = (raw.match(/\./g) ?? []).length;
    cleaned = dotCount > 1 ? raw.replace(/\./g, '') : raw;
  }

  if (!/^\d*\.?\d*$/.test(cleaned)) return null;

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100) / 100;
}
