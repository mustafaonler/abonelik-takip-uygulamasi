import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, RADIUS, TONES, type Tone } from '../lib/theme';

// ═══════════════════════════════════════════════════════════════════════════
// Paylaşılan arayüz parçaları
//
// Şablon seçimi (app/(tabs)/add.tsx) ve form (app/add/form.tsx) ayrı route'lara
// bölündüğü için ortak parçalar buraya taşındı; iki ekranda stil kayması olmasın.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Küçük renkli rozet. Koyu zeminde okunurluk için düşük opaklıkta zemin +
 * belirgin kenarlık kullanır (bkz. lib/theme.ts TONES).
 */
export function Badge({
  label,
  tone = 'neutral',
  icon,
}: {
  label: string;
  tone?: Tone;
  icon?: string;
}) {
  const t = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg, borderColor: t.border }]}>
      {icon ? <Text style={[styles.badgeIcon, { color: t.text }]}>{icon}</Text> : null}
      <Text style={[styles.badgeText, { color: t.text }]}>{label}</Text>
    </View>
  );
}

/** Rozetleri satır sonunda alta saran kapsayıcı. */
export function BadgeRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.badgeRow}>{children}</View>;
}

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
        {required && <Text style={styles.requiredMark}> *</Text>}
        {hint ? <Text style={styles.fieldLabelHint}>{`  ${hint}`}</Text> : null}
      </Text>
      {children}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // ── Rozet ──
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  badgeIcon: { fontSize: 10.5, lineHeight: 14 },
  badgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2, lineHeight: 14 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },

  // ── Form bölümü ──
  section: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: 18,
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primaryLight,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 16,
  },

  field: { marginBottom: 16 },
  fieldLabel: { fontSize: 13.5, color: COLORS.muted, marginBottom: 7, fontWeight: '500' },
  fieldLabelHint: { fontSize: 12, color: COLORS.dimmest, fontWeight: '400' },
  requiredMark: { color: COLORS.danger },

  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceStrong,
  },
  chipSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 13, color: COLORS.muted, fontWeight: '500' },
  chipTextSelected: { color: '#fff', fontWeight: '700' },
});
