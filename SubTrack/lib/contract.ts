import type { PenaltyType } from '../types';
import { addMonths, parseISODate, todayISO } from './format';

// ═══════════════════════════════════════════════════════════════════════════
// Cayma bedeli hesabı — form önizlemesi için
//
// ⚠️  Bu dosya, veritabanındaki public.calculate_early_termination_fee()
//     fonksiyonunun JS aynasıdır. Biri değişirse DİĞERİ DE değişmelidir.
//     Kaynak: supabase/migrations/20260730120000_scope2_core_schema.sql
//
//     Gösterilen tek doğru kaynak DB'dir; buradaki hesap yalnızca kullanıcı
//     formu doldururken anlık geri bildirim vermek içindir.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * SQL'deki months_remaining() ile aynı davranış:
 * tam ay sayısı, kalan gün varsa yukarı yuvarlanır, en az 0.
 */
export function monthsRemaining(fromISO: string, toISO: string): number {
  const from = parseISODate(fromISO);
  const to = parseISODate(toISO);
  if (!from || !to || to <= from) return 0;

  let months =
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());

  // Ay farkı gün bazında henüz dolmadıysa bir geri al.
  if (addMonths(from, months) > to) months -= 1;

  // Kalan gün varsa yukarı yuvarla (SQL'deki `+ case when day > 0 then 1`).
  const anchor = addMonths(from, months);
  const remainderDays = Math.round((to.getTime() - anchor.getTime()) / 86_400_000);

  return Math.max(0, months + (remainderDays > 0 ? 1 : 0));
}

export interface PenaltyInput {
  penaltyType: PenaltyType;
  /** Taahhüt bitiş tarihi, 'YYYY-MM-DD'. */
  endDateISO: string;
  penaltyFixedAmount?: number | null;
  monthlyDiscountAmount?: number | null;
  deviceOutstandingAmount?: number | null;
  penaltyCapAmount?: number | null;
  /** 'remaining_installments' modeli için aylık ücret. */
  monthlyAmount?: number | null;
  /** Varsayılan: bugün. */
  asOfISO?: string;
}

export interface PenaltyResult {
  fee: number;
  monthsLeft: number;
  /** Tavan uygulandıysa true — kullanıcıya "sınırlandırıldı" demek için. */
  capped: boolean;
}

export function calculateEarlyTerminationFee(input: PenaltyInput): PenaltyResult {
  const asOf = input.asOfISO ?? todayISO();
  const device = Number(input.deviceOutstandingAmount ?? 0);

  const end = parseISODate(input.endDateISO);
  const from = parseISODate(asOf);

  // Taahhüt bitmişse cayma bedeli yoktur.
  if (!end || !from || end <= from) {
    return { fee: 0, monthsLeft: 0, capped: false };
  }

  const monthsLeft = monthsRemaining(asOf, input.endDateISO);

  let fee: number;
  switch (input.penaltyType) {
    case 'fixed':
      fee = Number(input.penaltyFixedAmount ?? 0);
      break;

    case 'remaining_discount':
      fee = monthsLeft * Number(input.monthlyDiscountAmount ?? 0) + device;
      break;

    case 'remaining_installments':
      fee = monthsLeft * Number(input.monthlyAmount ?? 0) + device;
      break;

    case 'none':
    default:
      fee = 0;
      break;
  }

  const cap = input.penaltyCapAmount;
  const capped = cap !== null && cap !== undefined && fee > Number(cap);
  if (capped) fee = Number(cap);

  return {
    fee: Math.round(fee * 100) / 100,
    monthsLeft,
    capped: capped,
  };
}

// ─── Cayma modeli seçenekleri (form için) ──────────────────────────────────

export const PENALTY_OPTIONS: {
  value: PenaltyType;
  label: string;
  description: string;
}[] = [
  {
    value: 'none',
    label: 'Yok',
    description: 'Taahhüt var ama cayma bedeli uygulanmıyor.',
  },
  {
    value: 'remaining_discount',
    label: 'Kalan indirim',
    description: 'Kalan ay × aylık indirim + cihaz bakiyesi. Operatörlerin standardı.',
  },
  {
    value: 'remaining_installments',
    label: 'Kalan taksitler',
    description: 'Kalan ay × aylık ücret. Spor salonu üyeliklerinde yaygın.',
  },
  {
    value: 'fixed',
    label: 'Sabit tutar',
    description: 'Sözleşmede yazan tek bir tutar.',
  },
];
