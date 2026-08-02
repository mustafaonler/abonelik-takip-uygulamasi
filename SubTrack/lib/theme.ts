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
