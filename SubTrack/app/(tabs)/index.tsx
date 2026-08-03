import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router, useFocusEffect } from 'expo-router';
import { useDashboard } from '../../hooks/useDashboard';
import { Badge, BadgeRow } from '../../components/ui';
import { BreakdownPie } from '../../components/BreakdownPie';
import { COLORS, TONES, type Tone } from '../../lib/theme';
import {
  formatCurrency,
  formatCycle,
  formatDate,
  formatRelativeDays,
  formatRemaining,
} from '../../lib/format';
import type { SubscriptionEnriched } from '../../types';

const { width } = Dimensions.get('window');

const ADD_ROUTE = '/(tabs)/add';

// Grafik genişliği = ekran − liste kenar boşluğu (2×20) − kart iç boşluğu (2×20).
// Geniş ekranlarda (web) sınırlandırılıyor; yoksa pasta gereksiz büyüyor.
const chartWidth = Math.min(width - 80, 420);

/** Ödeme tarihine kalan güne göre vurgu rengi. */
function paymentTone(days: number): string {
  if (days < 0) return COLORS.danger;
  if (days <= 3) return COLORS.warn;
  return COLORS.muted;
}

/**
 * Taahhüt bitişine kalan güne göre ton. Ödeme eşiklerinden ayrı: taahhüdün
 * bitmesine 1 ay kalması, ödemeye 1 ay kalmasından çok daha acil bir karar
 * (cayma bedeli o pencerede hızla düşüyor).
 */
function contractBadgeTone(days: number): Tone {
  if (days <= 30) return 'danger';
  if (days <= 60) return 'warn';
  return 'info';
}

/** Taahhüt ilerleme çubuğunun dolgu rengi — rozetle aynı tonu kullanır. */
function contractTone(days: number): string {
  return TONES[contractBadgeTone(days)].text;
}

// ═══════════════════════════════════════════════════════════════════════════
// Ana ekran
// ═══════════════════════════════════════════════════════════════════════════

export default function DashboardScreen() {
  const {
    loading,
    refreshing,
    error,
    subscriptions,
    monthlyTotal,
    yearlyTotal,
    activeCount,
    otherCurrencies,
    nextPayment,
    endingContracts,
    subscriptionBreakdown,
    refetch,
  } = useDashboard();

  // "Ekle" sekmesinde yeni abonelik kaydedip geri dönüldüğünde liste tazelensin.
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

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={refetch}
      tintColor={COLORS.primaryLight}
      colors={[COLORS.primary]}
      progressBackgroundColor="#1a1a2e"
    />
  );

  // ── İlk yükleme ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color={COLORS.primaryLight} />
        <Text style={styles.centeredText}>Aboneliklerin yükleniyor...</Text>
      </View>
    );
  }

  // ── Hata ───────────────────────────────────────────────────────────────
  if (error && subscriptions.length === 0) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <ScrollView
          contentContainerStyle={styles.fullScreenScroll}
          refreshControl={refreshControl}
        >
          <ErrorState message={error} onRetry={refetch} />
        </ScrollView>
      </View>
    );
  }

  // ── Boş durum ──────────────────────────────────────────────────────────
  if (subscriptions.length === 0) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <ScrollView
          contentContainerStyle={styles.fullScreenScroll}
          refreshControl={refreshControl}
        >
          <EmptyState onAdd={() => router.push(ADD_ROUTE)} />
        </ScrollView>
      </View>
    );
  }

  // ── Dolu liste ─────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <FlatList
        data={subscriptions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <SubscriptionCard item={item} />}
        ItemSeparatorComponent={() => <View style={styles.cardGap} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
        ListHeaderComponent={
          <View>
            <SummaryCard
              monthlyTotal={monthlyTotal}
              yearlyTotal={yearlyTotal}
              activeCount={activeCount}
              nextPaymentLabel={
                nextPayment
                  ? formatRelativeDays(nextPayment.daysUntil)
                  : 'Planlanmış ödeme yok'
              }
              nextPaymentName={nextPayment?.subscription.name ?? null}
              nextPaymentDate={nextPayment ? formatDate(nextPayment.date) : null}
            />

            {/* Abonelik bazlı: her servis kendi dilimi. Kategori bazlı görünüm
                Analizler sekmesinde. */}
            {subscriptionBreakdown.length > 0 && (
              <View style={styles.breakdownCard}>
                <Text style={styles.breakdownTitle}>Servis Dağılımı</Text>
                <BreakdownPie slices={subscriptionBreakdown} width={chartWidth} />
              </View>
            )}

            {endingContracts.length > 0 && (
              <AlertBanner
                icon="⏳"
                tone={COLORS.warn}
                text={
                  endingContracts.length === 1
                    ? `${endingContracts[0].name} taahhüdü ${formatRemaining(
                        endingContracts[0].contract_days_left ?? 0,
                      ).toLowerCase()}.`
                    : `${endingContracts.length} taahhüdünün bitişi yaklaşıyor.`
                }
              />
            )}

            {otherCurrencies.length > 0 && (
              <AlertBanner
                icon="💱"
                tone={COLORS.dim}
                text={`Ayrıca ${otherCurrencies
                  .map((c) => `${formatCurrency(Number(c.monthly_total), c.currency)}/ay`)
                  .join(' + ')} tutarında yabancı para aboneliğin var. Kur çevrimi yapılmadı.`}
              />
            )}

            {/* Kısmi hata: eski veri ekranda duruyor ama yenileme başarısız oldu */}
            {error && (
              <AlertBanner
                icon="⚠️"
                tone={COLORS.danger}
                text="Veriler güncellenemedi, ekranda son bilinen liste görünüyor."
              />
            )}

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Aboneliklerim</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{subscriptions.length}</Text>
              </View>
            </View>
          </View>
        }
        ListFooterComponent={
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push(ADD_ROUTE)}
            activeOpacity={0.85}
          >
            <Text style={styles.addButtonIcon}>＋</Text>
            <Text style={styles.addButtonText}>Yeni Abonelik Ekle</Text>
          </TouchableOpacity>
        }
      />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Üst özet kartı
// ═══════════════════════════════════════════════════════════════════════════

interface SummaryCardProps {
  monthlyTotal: number;
  yearlyTotal: number;
  activeCount: number;
  nextPaymentLabel: string;
  nextPaymentName: string | null;
  nextPaymentDate: string | null;
}

function SummaryCard({
  monthlyTotal,
  yearlyTotal,
  activeCount,
  nextPaymentLabel,
  nextPaymentName,
  nextPaymentDate,
}: SummaryCardProps) {
  return (
    <View style={styles.summaryCard}>
      <View style={styles.summaryBlob} />

      <Text style={styles.summaryLabel}>AYLIK TOPLAM HARCAMA</Text>
      <Text style={styles.summaryAmount}>{formatCurrency(monthlyTotal, 'TRY')}</Text>
      <Text style={styles.summarySub}>
        Yıllık ≈ {formatCurrency(yearlyTotal, 'TRY')}
      </Text>

      <View style={styles.summaryDivider} />

      <View style={styles.statsRow}>
        <View style={styles.statCell}>
          <Text style={styles.statValue}>{activeCount}</Text>
          <Text style={styles.statLabel}>Aktif Abonelik</Text>
        </View>

        <View style={styles.statSeparator} />

        <View style={styles.statCell}>
          <Text style={styles.statValue} numberOfLines={1}>
            {nextPaymentLabel}
          </Text>
          <Text style={styles.statLabel} numberOfLines={1}>
            {nextPaymentName
              ? `${nextPaymentName}${nextPaymentDate ? ` · ${nextPaymentDate}` : ''}`
              : 'En Yakın Ödeme'}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Abonelik kartı
// ═══════════════════════════════════════════════════════════════════════════

function SubscriptionCard({ item }: { item: SubscriptionEnriched }) {
  // Karta dokunmak düzenleme formunu açar; form aynı route'ta subscriptionId
  // ile "düzenle" moduna geçiyor (bkz. app/form.tsx).
  const openEdit = () => router.push(`/form?subscriptionId=${item.id}`);

  const accent = item.color ?? item.category_color ?? COLORS.primary;
  const icon = item.category_icon ?? '📦';

  const monthly = Number(item.monthly_amount ?? 0);
  const isMonthly = item.billing_cycle === 'monthly' && item.billing_interval === 1;
  const daysUntil = Number(item.days_until_payment ?? 0);

  const hasContract =
    item.contract_id !== null && item.contract_days_left !== null;
  const contractDays = Number(item.contract_days_left ?? 0);
  const progress = Math.max(0, Math.min(100, Number(item.contract_progress_pct ?? 0)));
  const penalty = Number(item.early_termination_fee ?? 0);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={openEdit}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${item.name} aboneliğini düzenle`}
    >
      <View style={styles.cardTop}>
        <View style={[styles.iconCircle, { backgroundColor: `${accent}33`, borderColor: `${accent}66` }]}>
          <Text style={styles.iconText}>{icon}</Text>
        </View>

        <View style={styles.cardTitleBlock}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.name}
            </Text>
            {item.status === 'trial' && <Badge label="DENEME" tone="success" />}
          </View>
          <Text style={styles.cardSubtitle} numberOfLines={1}>
            {item.category_name ?? item.provider_name ?? 'Kategorisiz'}
          </Text>
        </View>

        <View style={styles.priceBlock}>
          <Text style={styles.priceText}>{formatCurrency(monthly, item.currency)}</Text>
          <Text style={styles.priceCycle}>/ay</Text>
          {!isMonthly && (
            <Text style={styles.priceOriginal}>
              {formatCurrency(Number(item.price), item.currency)} /
              {formatCycle(item.billing_cycle, item.billing_interval)}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.cardDivider} />

      {hasContract ? (
        <View style={styles.contractBlock}>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${progress}%`, backgroundColor: contractTone(contractDays) },
              ]}
            />
          </View>
          <BadgeRow>
            <Badge
              label={`Taahhüt · ${formatRemaining(contractDays)}`}
              tone={contractBadgeTone(contractDays)}
              icon="◷"
            />
            {penalty > 0 && (
              <Badge
                label={`Cayma ${formatCurrency(penalty, item.currency)}`}
                tone="warn"
                icon="⚡"
              />
            )}
            <Badge
              label={
                daysUntil < 0
                  ? `${Math.abs(daysUntil)} gün gecikti`
                  : formatRelativeDays(daysUntil)
              }
              tone={daysUntil < 0 ? 'danger' : daysUntil <= 3 ? 'warn' : 'neutral'}
              icon="⏱"
            />
          </BadgeRow>
        </View>
      ) : (
        <View style={styles.renewalRow}>
          <Text style={[styles.renewalText, { color: paymentTone(daysUntil) }]}>
            {daysUntil < 0
              ? `⚠ Ödeme ${Math.abs(daysUntil)} gün gecikti`
              : `⏱ ${formatRelativeDays(daysUntil)} yenilenecek`}
          </Text>
          <Text style={styles.renewalDate}>{formatDate(item.next_payment_date)}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Yardımcı bileşenler
// ═══════════════════════════════════════════════════════════════════════════

function AlertBanner({ icon, text, tone }: { icon: string; text: string; tone: string }) {
  return (
    <View style={[styles.banner, { borderColor: `${tone}55`, backgroundColor: `${tone}14` }]}>
      <Text style={styles.bannerIcon}>{icon}</Text>
      <Text style={[styles.bannerText, { color: tone === COLORS.dim ? COLORS.muted : tone }]}>
        {text}
      </Text>
    </View>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIconOuter}>
        <View style={styles.emptyIconInner}>
          <Text style={styles.emptyIcon}>◈</Text>
        </View>
      </View>

      <Text style={styles.emptyTitle}>Henüz bir abonelik eklemediniz</Text>
      <Text style={styles.emptyText}>
        Netflix'ten operatör taahhüdüne, spor salonundan sigortaya kadar
        tüm düzenli ödemelerini tek ekranda topla.
      </Text>

      <TouchableOpacity style={styles.emptyButton} onPress={onAdd} activeOpacity={0.85}>
        <Text style={styles.emptyButtonIcon}>＋</Text>
        <Text style={styles.emptyButtonText}>Yeni Ekle</Text>
      </TouchableOpacity>

      <Text style={styles.emptyHint}>Yenilemek için ekranı aşağı çek</Text>
    </View>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.emptyWrap}>
      <View style={[styles.emptyIconOuter, styles.errorIconOuter]}>
        <View style={[styles.emptyIconInner, styles.errorIconInner]}>
          <Text style={styles.emptyIcon}>⚠</Text>
        </View>
      </View>

      <Text style={styles.emptyTitle}>Veriler yüklenemedi</Text>
      <Text style={styles.emptyText}>{message}</Text>

      <TouchableOpacity style={styles.retryButton} onPress={onRetry} activeOpacity={0.85}>
        <Text style={styles.retryButtonText}>Tekrar Dene</Text>
      </TouchableOpacity>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Stiller
// ═══════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  centered: { alignItems: 'center', justifyContent: 'center', gap: 16 },
  centeredText: { color: COLORS.dim, fontSize: 15 },
  fullScreenScroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },

  listContent: { padding: 20, paddingBottom: 40 },
  cardGap: { height: 12 },

  // ── Servis dağılımı ──
  breakdownCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    // Köşe yarıçapı 28: dipteki tam genişlikte legend satırı 20px boşlukla
    // kavise sürtüyor ve kesikmiş gibi duruyordu. Alt boşluk yarıçapa yetecek
    // kadar açıldı.
    paddingBottom: 28,
    marginBottom: 16,
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

  // ── Özet kartı ──
  summaryCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 24,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 10,
  },
  summaryBlob: {
    position: 'absolute',
    width: width * 0.7,
    height: width * 0.7,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
    opacity: 0.16,
    top: -width * 0.45,
    right: -width * 0.25,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primaryLight,
    letterSpacing: 1.4,
    marginBottom: 10,
  },
  summaryAmount: {
    fontSize: 40,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -1.2,
  },
  summarySub: { fontSize: 14, color: COLORS.dim, marginTop: 6 },
  summaryDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 20,
  },

  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statCell: { flex: 1, gap: 4 },
  statSeparator: { width: 1, height: 34, backgroundColor: COLORS.border, marginHorizontal: 16 },
  statValue: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  statLabel: { fontSize: 12, color: COLORS.dim },

  // ── Uyarı bandı ──
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  bannerIcon: { fontSize: 15, lineHeight: 20 },
  bannerText: { flex: 1, fontSize: 13, lineHeight: 20, fontWeight: '500' },

  // ── Bölüm başlığı ──
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    marginBottom: 14,
  },
  sectionTitle: { fontSize: 19, fontWeight: '700', color: COLORS.text },
  countBadge: {
    minWidth: 24,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: COLORS.surfaceStrong,
    alignItems: 'center',
  },
  countBadgeText: { fontSize: 12, fontWeight: '700', color: COLORS.muted },

  // ── Abonelik kartı ──
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconCircle: {
    width: 46,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: { fontSize: 20 },
  cardTitleBlock: { flex: 1, gap: 3 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, flexShrink: 1 },
  cardSubtitle: { fontSize: 13, color: COLORS.dim },
  priceBlock: { alignItems: 'flex-end' },
  priceText: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  priceCycle: { fontSize: 11, color: COLORS.dimmest, marginTop: -2 },
  priceOriginal: { fontSize: 10, color: COLORS.dimmest, marginTop: 3 },

  cardDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 14 },

  // ── Taahhüt ──
  contractBlock: { gap: 8 },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 999 },
  // ── Yenileme ──
  renewalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  renewalText: { fontSize: 13, fontWeight: '600' },
  renewalDate: { fontSize: 12.5, color: COLORS.dimmest },

  // ── Alt "ekle" butonu ──
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    paddingVertical: 15,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(167,139,250,0.4)',
  },
  addButtonIcon: { fontSize: 18, color: COLORS.primaryLight, fontWeight: '700' },
  addButtonText: { fontSize: 15, fontWeight: '600', color: COLORS.primaryLight },

  // ── Boş / hata durumu ──
  emptyWrap: { alignItems: 'center', paddingHorizontal: 8 },
  emptyIconOuter: {
    width: 108,
    height: 108,
    borderRadius: 36,
    backgroundColor: 'rgba(124,58,237,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  emptyIconInner: {
    width: 76,
    height: 76,
    borderRadius: 26,
    backgroundColor: 'rgba(124,58,237,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorIconOuter: { backgroundColor: 'rgba(239,68,68,0.12)' },
  errorIconInner: {
    backgroundColor: 'rgba(239,68,68,0.22)',
    borderColor: 'rgba(239,68,68,0.5)',
  },
  emptyIcon: { fontSize: 34, color: COLORS.primaryLight },
  emptyTitle: {
    fontSize: 21,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 15,
    color: COLORS.dim,
    textAlign: 'center',
    lineHeight: 23,
    marginBottom: 32,
    paddingHorizontal: 12,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 16,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 10,
  },
  emptyButtonIcon: { fontSize: 18, color: '#fff', fontWeight: '700' },
  emptyButtonText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  emptyHint: { marginTop: 20, fontSize: 12.5, color: COLORS.dimmest },

  retryButton: {
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.5)',
    backgroundColor: 'rgba(124,58,237,0.15)',
  },
  retryButtonText: { fontSize: 15, fontWeight: '700', color: COLORS.primaryLight },
});
