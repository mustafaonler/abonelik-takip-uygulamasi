import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PieChart } from 'react-native-chart-kit';
import { COLORS, RADIUS } from '../lib/theme';
import { formatCurrency } from '../lib/format';
import type { BreakdownSlice } from '../hooks/useDashboard';

// ═══════════════════════════════════════════════════════════════════════════
// BreakdownPie — aylık harcama dağılımı halkası
//
// Gruplamadan bağımsız: ana sayfa abonelik bazlı, Analizler sekmesi kategori
// bazlı dilim besliyor. Bileşen sadece çiziyor.
//
// Grafik react-native-chart-kit'in PieChart'ı, legend'i bizim.
// hasLegend={false} çünkü kütüphanenin legend'i SVG <Text> ile çiziliyor:
// sabit satır aralığı kullanıyor, uzun Türkçe adlarda ("Operatör & İnternet")
// taşıyor ve sarmalamıyor. Kendi legend'imiz normal View/Text olduğu için
// sarmalıyor, tutarı ve yüzdeyi birlikte gösterebiliyor.
//
// ⚠ Konumlandırma: kütüphane dilimleri x = width/4 + paddingLeft noktasına
// ötelenmiş bir <G> içinde çiziyor. Pastayı yatayda ortalamak için
// paddingLeft = width/4 vermek gerekiyor, aksi hâlde sola kaçık duruyor.
// (node_modules/react-native-chart-kit/dist/charts/pie/PieChart.js)
// ═══════════════════════════════════════════════════════════════════════════

const CHART_HEIGHT = 200;

export function BreakdownPie({
  slices,
  width,
  centerLabel = 'aylık',
}: {
  slices: BreakdownSlice[];
  /** Kartın iç genişliği. Grafik bunun tamamını kullanır. */
  width: number;
  /** Halkanın ortasındaki üst satır. */
  centerLabel?: string;
}) {
  if (slices.length === 0) return null;

  const total = slices.reduce((sum, s) => sum + s.amount, 0);

  const data = slices.map((s) => ({
    name: s.name,
    amount: s.amount,
    color: s.color,
    // hasLegend kapalı olduğu için bu ikisi çizime girmiyor; kütüphanenin
    // legend'i açılırsa diye tip uyumu için duruyorlar.
    legendFontColor: COLORS.muted,
    legendFontSize: 12,
  }));

  return (
    <View style={styles.wrap}>
      <View style={styles.chartRow}>
        <PieChart
          data={data}
          width={width}
          height={CHART_HEIGHT}
          accessor="amount"
          backgroundColor="transparent"
          paddingLeft={String(width / 4)}
          hasLegend={false}
          chartConfig={{
            color: () => COLORS.text,
            labelColor: () => COLORS.muted,
          }}
        />

        {/* Ortadaki delik: pasta yerine halka görünümü verir ve boşluğa
            toplam tutarı yazabiliyoruz. Kütüphane donut desteklemiyor
            (r: 0 sabit), bu yüzden üstüne bindiriyoruz. */}
        <View style={styles.donutHole} pointerEvents="none">
          <Text style={styles.holeLabel}>{centerLabel}</Text>
          <Text style={styles.holeValue} numberOfLines={1} adjustsFontSizeToFit>
            {formatCurrency(total, 'TRY')}
          </Text>
        </View>
      </View>

      <View style={styles.legend}>
        {slices.map((s) => (
          <View key={s.key} style={styles.legendRow}>
            <View style={[styles.swatch, { backgroundColor: s.color }]} />
            <Text style={styles.legendName} numberOfLines={1}>
              {s.icon ? `${s.icon} ` : ''}
              {s.name}
            </Text>
            <Text style={styles.legendPct}>%{s.pct.toFixed(s.pct < 10 ? 1 : 0)}</Text>
            <Text style={styles.legendAmount}>{formatCurrency(s.amount, 'TRY')}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const HOLE_SIZE = 104;

const styles = StyleSheet.create({
  wrap: { marginTop: 4 },
  chartRow: { alignItems: 'center', justifyContent: 'center' },

  donutHole: {
    position: 'absolute',
    width: HOLE_SIZE,
    height: HOLE_SIZE,
    borderRadius: HOLE_SIZE / 2,
    backgroundColor: COLORS.bgElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  holeLabel: {
    fontSize: 10.5,
    color: COLORS.dim,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  holeValue: { fontSize: 17, fontWeight: '800', color: COLORS.text, marginTop: 2 },

  legend: { marginTop: 14, gap: 2 },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  swatch: { width: 11, height: 11, borderRadius: RADIUS.pill },
  legendName: { flex: 1, fontSize: 13.5, color: COLORS.text, fontWeight: '500' },
  legendPct: {
    fontSize: 12.5,
    color: COLORS.muted,
    fontWeight: '700',
    minWidth: 44,
    textAlign: 'right',
  },
  legendAmount: {
    fontSize: 13,
    color: COLORS.primaryLight,
    fontWeight: '700',
    minWidth: 84,
    textAlign: 'right',
  },
});
