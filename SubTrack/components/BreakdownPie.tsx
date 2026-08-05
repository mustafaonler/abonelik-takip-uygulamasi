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

// Pasta yarıçapı kütüphanede sabit: R = height / 2.5 → 80px (çap 160).
const PIE_RADIUS = CHART_HEIGHT / 2.5;

// Halka kalınlığı 28 → 14: delik büyüdükçe ortadaki tutar kenarlara değmeden
// okunuyor. Delik çapını yarıçaptan türetiyoruz ki ikisi birbirinden kaymasın.
const RING_THICKNESS = 14;
const HOLE_SIZE = (PIE_RADIUS - RING_THICKNESS) * 2; // → 132

/** Deliğin yazıya bıraktığı gerçek genişlik (iki yandan iç boşluk düşülmüş). */
const HOLE_INNER_WIDTH = HOLE_SIZE - 24;

/**
 * Tutarı deliğe sığdıran punto. Ölçüm yapamadığımız için karakter sayısından
 * gidiyoruz: bu ağırlıkta ~0.58em ortalama karakter genişliği tutuyor
 * ("₺1.234,56" gibi rakam ağırlıklı dizelerde).
 *
 * adjustsFontSizeToFit tek başına yeterli değil: iOS'ta çalışıyor, Android ve
 * web'de güvenilmez. Bu yüzden puntoyu baştan doğru seçip onu yalnızca emniyet
 * kemeri olarak bırakıyoruz.
 */
function fitFontSize(text: string): number {
  const maxSize = 20;
  const minSize = 12;
  const estimated = HOLE_INNER_WIDTH / (text.length * 0.58);
  return Math.max(minSize, Math.min(maxSize, Math.floor(estimated)));
}

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
  const totalText = formatCurrency(total, 'TRY');

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
          <Text
            style={[styles.holeValue, { fontSize: fitFontSize(totalText) }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {totalText}
          </Text>
        </View>
      </View>

      <View style={styles.legend}>
        {slices.map((s, index) => (
          <View
            key={s.key}
            // Son satırda ayraç yok: kartın dibine yakın duran tam genişlikte
            // bir çizgi, yuvarlak köşeye denk gelince içerik kesilmiş gibi
            // görünüyor. Ayraçlar satırları ayırmak için, listeyi kapatmak için değil.
            style={[styles.legendRow, index === slices.length - 1 && styles.legendRowLast]}
          >
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
  // fontSize çalışma anında fitFontSize() ile veriliyor.
  holeValue: { fontWeight: '800', color: COLORS.text, marginTop: 2 },

  legend: { marginTop: 14, gap: 2 },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  legendRowLast: { borderBottomWidth: 0 },
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
