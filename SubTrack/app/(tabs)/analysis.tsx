import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router, useFocusEffect } from 'expo-router';
import { useDashboard } from '../../hooks/useDashboard';
import { BreakdownPie } from '../../components/BreakdownPie';
import { Badge, BadgeRow } from '../../components/ui';
import { COLORS, RADIUS } from '../../lib/theme';
import { formatCurrency } from '../../lib/format';

const { width } = Dimensions.get('window');

// Ana sayfayla aynı hesap: ekran − liste boşluğu (2×20) − kart iç boşluğu (2×20).
const chartWidth = Math.min(width - 80, 420);

// ═══════════════════════════════════════════════════════════════════════════
// Analizler — harcamanın kategori bazlı dağılımı
//
// Ana sayfadaki grafik abonelik bazlı ("Netflix'e ne ödüyorum"), buradaki
// kategori bazlı ("yayın platformlarına toplam ne ödüyorum"). İkisi de aynı
// useDashboard verisinden türüyor; bu ekran kendi örneğini mount ediyor.
// ═══════════════════════════════════════════════════════════════════════════

export default function AnalysisScreen() {
  const {
    loading,
    refreshing,
    error,
    monthlyTotal,
    yearlyTotal,
    activeCount,
    otherCurrencies,
    categoryBreakdown,
    refetch,
  } = useDashboard();

  // Başka sekmede abonelik eklenip dönüldüğünde dağılım tazelensin.
  // İlk odaklanma atlanır — useDashboard zaten mount'ta bir kez çekiyor.
  const firstFocusRef = React.useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocusRef.current) {
        firstFocusRef.current = false;
        return;
      }
      void refetch();
    }, [refetch]),
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color={COLORS.primaryLight} />
        <Text style={styles.centeredText}>Analiz hazırlanıyor...</Text>
      </View>
    );
  }

  const topCategory = categoryBreakdown[0] ?? null;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refetch}
            tintColor={COLORS.primaryLight}
            colors={[COLORS.primary]}
            progressBackgroundColor={COLORS.bgElevated}
          />
        }
      >
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>
              Veriler güncellenemedi, ekranda son bilinen dağılım görünüyor.
            </Text>
            <TouchableOpacity onPress={refetch} style={styles.retrySmall}>
              <Text style={styles.retrySmallText}>Tekrar Dene</Text>
            </TouchableOpacity>
          </View>
        )}

        {categoryBreakdown.length === 0 ? (
          <EmptyAnalysis hasOtherCurrencies={otherCurrencies.length > 0} />
        ) : (
          <>
            <View style={styles.headerCard}>
              <Text style={styles.headerLabel}>Aylık Toplam</Text>
              <Text style={styles.headerAmount}>
                {formatCurrency(monthlyTotal, 'TRY')}
              </Text>
              <Text style={styles.headerSub}>
                Yıllık ≈ {formatCurrency(yearlyTotal, 'TRY')}
              </Text>

              <BadgeRow>
                <Badge label={`${activeCount} aktif abonelik`} tone="info" icon="◉" />
                <Badge
                  label={`${categoryBreakdown.length} kategori`}
                  tone="neutral"
                  icon="◫"
                />
                {topCategory && (
                  <Badge
                    label={`En çok: ${topCategory.name} %${topCategory.pct.toFixed(0)}`}
                    tone="warn"
                    icon="▲"
                  />
                )}
              </BadgeRow>
            </View>

            <View style={styles.breakdownCard}>
              <Text style={styles.breakdownTitle}>Kategori Dağılımı</Text>
              <BreakdownPie slices={categoryBreakdown} width={chartWidth} />
            </View>

            {/* Kur çevrimi yapılmadığı için TRY dışı kayıtlar grafiğe girmiyor.
                Bunu söylemezsek kullanıcı eksik toplamı hata sanar. */}
            {otherCurrencies.length > 0 && (
              <View style={styles.noteBox}>
                <Text style={styles.noteText}>
                  {otherCurrencies
                    .map((c) => formatCurrency(Number(c.monthly_total), c.currency))
                    .join(' + ')}{' '}
                  tutarındaki yabancı para aboneliklerin bu dağılıma dâhil değil.
                  Kur çevrimi yapılmıyor.
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function EmptyAnalysis({ hasOtherCurrencies }: { hasOtherCurrencies: boolean }) {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIcon}>
        <Text style={styles.emptyIconText}>◔</Text>
      </View>
      <Text style={styles.emptyTitle}>Henüz analiz edilecek harcama yok</Text>
      <Text style={styles.emptyText}>
        {hasOtherCurrencies
          ? 'TRY cinsinden aboneliğin yok. Dağılım grafiği kur çevrimi yapmadığı için yalnızca TRY harcamalarını gösteriyor.'
          : 'Birkaç abonelik ekledikten sonra harcamalarının hangi kategoride yoğunlaştığını burada göreceksin.'}
      </Text>
      <TouchableOpacity
        style={styles.emptyButton}
        onPress={() => router.push('/(tabs)/add')}
        activeOpacity={0.85}
      >
        <Text style={styles.emptyButtonText}>Abonelik Ekle</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 20, paddingBottom: 40 },
  centered: { justifyContent: 'center', alignItems: 'center', gap: 14 },
  centeredText: { color: COLORS.muted, fontSize: 14 },

  headerCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 24,
    marginBottom: 16,
  },
  headerLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primaryLight,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  headerAmount: {
    fontSize: 34,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -1,
    marginTop: 8,
  },
  headerSub: { fontSize: 13.5, color: COLORS.dim, marginTop: 4 },

  breakdownCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    alignItems: 'center',
  },
  breakdownTitle: {
    alignSelf: 'flex-start',
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primaryLight,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },

  noteBox: {
    backgroundColor: 'rgba(245,158,11,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.32)',
    borderRadius: RADIUS.md,
    padding: 14,
    marginTop: 16,
  },
  noteText: { color: COLORS.warn, fontSize: 12.5, lineHeight: 19 },

  errorBox: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
    borderRadius: RADIUS.md,
    padding: 14,
    marginBottom: 16,
    gap: 10,
  },
  errorText: { color: COLORS.danger, fontSize: 13.5, lineHeight: 20 },
  retrySmall: { alignSelf: 'flex-start' },
  retrySmallText: { color: COLORS.primaryLight, fontWeight: '700', fontSize: 13.5 },

  emptyWrap: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 12 },
  emptyIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIconText: { fontSize: 38, color: COLORS.primaryLight },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 22,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.muted,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 10,
  },
  emptyButton: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    paddingHorizontal: 28,
    marginTop: 24,
  },
  emptyButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
