import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { COLORS, RADIUS } from '../../lib/theme';
import { Badge, Chip } from '../../components/ui';
import { useServiceTemplates } from '../../hooks/useServiceTemplates';
import type { ServiceTemplate } from '../../types';

// ═══════════════════════════════════════════════════════════════════════════
// Adım 1 — Şablon seçimi
//
// Seçim yapılınca form ayrı bir route'ta açılır (app/add/form.tsx). Form burada
// gömülü değil çünkü sekme bileşeni mount'ta kalıyor; kaydettikten sonra
// "Ekle"ye dönen kullanıcı eski form değerlerini görüyordu.
// ═══════════════════════════════════════════════════════════════════════════

export default function TemplatePickerScreen() {
  const { templates, categories, categoryById, loading, error, refetch } =
    useServiceTemplates();

  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);

  function openForm(template: ServiceTemplate | null) {
    router.push(template ? `/form?templateId=${template.id}` : '/form');
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    return templates.filter((t) => {
      if (categoryId && t.category_id !== categoryId) return false;
      if (!q) return true;
      return (
        t.name.toLocaleLowerCase('tr-TR').includes(q) ||
        (t.provider_name ?? '').toLocaleLowerCase('tr-TR').includes(q)
      );
    });
  }, [templates, query, categoryId]);

  // Yalnızca şablonu olan kategorileri filtre çubuğunda göster.
  const usedCategories = useMemo(() => {
    const ids = new Set(templates.map((t) => t.category_id).filter(Boolean));
    return categories.filter((c) => ids.has(c.id));
  }, [templates, categories]);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.screenTitle}>Ne eklemek istiyorsun?</Text>
        <Text style={styles.screenSubtitle}>
          Hazır bir servis seç ya da bilgileri kendin gir.
        </Text>

        <TouchableOpacity
          style={styles.manualCard}
          onPress={() => openForm(null)}
          activeOpacity={0.85}
        >
          <View style={styles.manualIcon}>
            <Text style={styles.manualIconText}>✎</Text>
          </View>
          <View style={styles.manualTextBlock}>
            <Text style={styles.manualTitle}>Elle Ekle</Text>
            <Text style={styles.manualSubtitle}>
              Listede olmayan bir abonelik ya da üyelik
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>

        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Servis ara — Netflix, Turkcell, MACFit..."
          placeholderTextColor={COLORS.dimmest}
          autoCorrect={false}
        />

        {usedCategories.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            <Chip
              label="Tümü"
              selected={categoryId === null}
              onPress={() => setCategoryId(null)}
            />
            {usedCategories.map((c) => (
              <Chip
                key={c.id}
                label={`${c.icon ?? ''} ${c.name}`.trim()}
                selected={categoryId === c.id}
                onPress={() => setCategoryId(c.id)}
              />
            ))}
          </ScrollView>
        )}

        {loading && (
          <View style={styles.centerBlock}>
            <ActivityIndicator color={COLORS.primaryLight} />
          </View>
        )}

        {error && !loading && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={refetch} style={styles.retrySmall}>
              <Text style={styles.retrySmallText}>Tekrar Dene</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && !error && filtered.length === 0 && (
          <Text style={styles.noResult}>
            Eşleşen servis yok. "Elle Ekle" ile devam edebilirsin.
          </Text>
        )}

        {filtered.map((t) => {
          const category = t.category_id ? categoryById.get(t.category_id) : undefined;
          const accent = t.color ?? category?.color ?? COLORS.primary;

          return (
            <TouchableOpacity
              key={t.id}
              style={styles.templateRow}
              onPress={() => openForm(t)}
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.templateIcon,
                  { backgroundColor: `${accent}33`, borderColor: `${accent}66` },
                ]}
              >
                <Text style={styles.templateIconText}>{category?.icon ?? '📦'}</Text>
              </View>

              <View style={styles.templateTextBlock}>
                <Text style={styles.templateName} numberOfLines={1}>
                  {t.name}
                </Text>
                <Text style={styles.templateMeta} numberOfLines={1}>
                  {category?.name ?? 'Kategorisiz'}
                </Text>
              </View>

              {t.supports_contract && <Badge label="Taahhütlü" tone="warn" />}

              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Stiller
// ═══════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scrollContent: { padding: 20, paddingBottom: 40 },

  screenTitle: { fontSize: 26, fontWeight: '800', color: COLORS.text, letterSpacing: -0.6 },
  screenSubtitle: { fontSize: 14.5, color: COLORS.dim, marginTop: 6, marginBottom: 22 },

  // ── Elle ekle kartı ──
  manualCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.4)',
    borderRadius: RADIUS.lg,
    padding: 16,
    marginBottom: 20,
  },
  manualIcon: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: 'rgba(124,58,237,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualIconText: { fontSize: 20, color: COLORS.primaryLight },
  manualTextBlock: { flex: 1, gap: 3 },
  manualTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  manualSubtitle: { fontSize: 13, color: COLORS.muted },

  // ── Arama & liste ──
  searchInput: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    color: COLORS.text,
    marginBottom: 14,
  },
  chipRow: { gap: 8, paddingRight: 8, paddingBottom: 4 },

  templateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: 12,
    marginTop: 8,
  },
  templateIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateIconText: { fontSize: 18 },
  templateTextBlock: { flex: 1, gap: 2 },
  templateName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  templateMeta: { fontSize: 12.5, color: COLORS.dim },
  chevron: { fontSize: 24, color: COLORS.dimmest, marginRight: 4 },

  noResult: { color: COLORS.dim, fontSize: 14, textAlign: 'center', marginTop: 28 },
  centerBlock: { paddingVertical: 32, alignItems: 'center' },

  errorBox: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
    borderRadius: RADIUS.md,
    padding: 14,
    marginTop: 16,
    gap: 10,
  },
  errorText: { color: COLORS.danger, fontSize: 13.5, lineHeight: 20 },
  retrySmall: { alignSelf: 'flex-start' },
  retrySmallText: { color: COLORS.primaryLight, fontWeight: '700', fontSize: 13.5 },
});
