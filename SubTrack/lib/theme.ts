// ═══════════════════════════════════════════════════════════════════════════
// Tasarım token'ları — kaynak: app/(auth)/login.tsx'in görsel dili
// Yeni ekranlar renk kodunu elle yazmak yerine buradan almalı.
// ═══════════════════════════════════════════════════════════════════════════

export const COLORS = {
  bg: '#0d0d1a',
  bgElevated: '#1a1a2e',
  surface: 'rgba(255,255,255,0.05)',
  surfaceStrong: 'rgba(255,255,255,0.08)',
  border: 'rgba(255,255,255,0.1)',
  borderStrong: 'rgba(255,255,255,0.18)',

  primary: '#7c3aed',
  primaryLight: '#a78bfa',
  primarySoft: 'rgba(124,58,237,0.15)',

  text: '#f1f5f9',
  muted: '#94a3b8',
  dim: '#64748b',
  dimmest: '#475569',

  success: '#22c55e',
  warn: '#f59e0b',
  danger: '#ef4444',
} as const;

export const RADIUS = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// Rozet tonları
//
// Koyu zeminde dolu renk fazla bağırıyor; onun yerine düşük opaklıkta zemin +
// belirgin kenarlık + tam doygun metin kullanıyoruz. Metin rengi COLORS'tan
// geldiği için kontrast koyu temada okunur kalıyor.
// ═══════════════════════════════════════════════════════════════════════════

export type Tone = 'neutral' | 'info' | 'success' | 'warn' | 'danger';

export const TONES: Record<Tone, { bg: string; border: string; text: string }> = {
  neutral: {
    bg: COLORS.surfaceStrong,
    border: COLORS.border,
    text: COLORS.muted,
  },
  info: {
    bg: 'rgba(124,58,237,0.15)',
    border: 'rgba(167,139,250,0.40)',
    text: COLORS.primaryLight,
  },
  success: {
    bg: 'rgba(34,197,94,0.13)',
    border: 'rgba(34,197,94,0.38)',
    text: COLORS.success,
  },
  warn: {
    bg: 'rgba(245,158,11,0.14)',
    border: 'rgba(245,158,11,0.42)',
    text: COLORS.warn,
  },
  danger: {
    bg: 'rgba(239,68,68,0.14)',
    border: 'rgba(239,68,68,0.42)',
    text: COLORS.danger,
  },
};

/**
 * Kalan güne göre aciliyet tonu. Taahhüt bitişi ve ödeme tarihi aynı eşikleri
 * kullanır ki kullanıcı iki farklı yerde aynı rengi aynı anlamda görsün.
 */
export function daysTone(days: number | null | undefined): Tone {
  if (days == null) return 'neutral';
  if (days < 0) return 'danger';
  if (days <= 7) return 'danger';
  if (days <= 30) return 'warn';
  return 'info';
}
