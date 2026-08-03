import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { toErrorMessage } from '../lib/errors';
import type { DashboardSummary, SubscriptionEnriched } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// useDashboard — Scope 3'ün tek veri kaynağı
//
// İki view'ı paralel çeker:
//   v_dashboard_summary     → para birimi bazında aylık/yıllık toplam, sayaçlar
//   v_subscriptions_enriched → abonelik + kategori + taahhüt ilerlemesi + cayma
//
// Kullanıcı filtresi YOK — RLS zaten her satırı auth.uid()'e göre kısıtlıyor.
// (bkz. supabase/migrations/20260730120100_scope2_rls_policies.sql)
// ═══════════════════════════════════════════════════════════════════════════

/** Ana ekranda "aktif" sayılan durumlar. cancelled/paused/expired listelenmez. */
const ACTIVE_STATUSES: string[] = ['active', 'trial'];

/** Taahhüdü bu kadar gün içinde bitenler "yaklaşan" kabul edilir. */
const CONTRACT_ENDING_WINDOW_DAYS = 60;

/** Ödemesi bu kadar gün içinde olanlar "yaklaşan" kabul edilir. */
const UPCOMING_PAYMENT_WINDOW_DAYS = 30;

export interface NextPayment {
  subscription: SubscriptionEnriched;
  /** YYYY-MM-DD */
  date: string;
  /** Negatifse ödeme gecikmiş demektir. */
  daysUntil: number;
}

/** Pasta grafiği dilimi — hem abonelik hem kategori dağılımı bunu kullanır. */
export interface BreakdownSlice {
  /** Gruplama anahtarı (subscription.id ya da category_id). */
  key: string;
  name: string;
  icon: string | null;
  color: string;
  /** Aylığa normalize edilmiş TRY tutarı. */
  amount: number;
  /** 0–100 arası pay. */
  pct: number;
}

/**
 * Dilim paleti — koyu zeminde ayırt edilebilen, mor eksenli tonlar.
 * Abonelik dağılımında renk KATEGORİDEN gelmiyor: aynı kategorideki iki
 * abonelik (Netflix + Exxen) aynı rengi alır ve grafiğin tüm amacı olan
 * "hangi servise ne ödüyorum" ayrımı kaybolurdu. Bu yüzden sırayla dağıtılıyor.
 */
const SLICE_COLORS = [
  '#a78bfa', '#f59e0b', '#0ea5e9', '#ec4899',
  '#22c55e', '#7c3aed', '#14b8a6', '#f97316',
  '#c084fc', '#38bdf8', '#fb7185', '#84cc16',
];

const UNCATEGORIZED_KEY = '__none__';

/**
 * Pastada ayrı ayrı gösterilecek en fazla dilim. Fazlası "Diğer"de toplanır —
 * 15 dilimlik bir pastada ne dilimler ne de açıklama okunabiliyor.
 */
const MAX_SLICES = 8;

const OTHER_COLOR = '#64748b';

/** Tutarları yüzdeye çevirir, büyükten küçüğe sıralar, fazlasını "Diğer"de toplar. */
function finalizeSlices(raw: BreakdownSlice[]): BreakdownSlice[] {
  const sorted = [...raw].sort((a, b) => b.amount - a.amount);
  const total = sorted.reduce((sum, s) => sum + s.amount, 0);
  if (total <= 0) return [];

  let slices = sorted;

  if (sorted.length > MAX_SLICES) {
    const head = sorted.slice(0, MAX_SLICES - 1);
    const tail = sorted.slice(MAX_SLICES - 1);
    head.push({
      key: '__other__',
      name: `Diğer (${tail.length})`,
      icon: null,
      color: OTHER_COLOR,
      amount: tail.reduce((sum, s) => sum + s.amount, 0),
      pct: 0,
    });
    slices = head;
  }

  return slices.map((s) => ({ ...s, pct: (s.amount / total) * 100 }));
}

export interface UseDashboardResult {
  /** Yalnızca ilk yükleme. Pull-to-refresh sırasında false kalır. */
  loading: boolean;
  /** Pull-to-refresh sürüyor. RefreshControl'e bağlanır. */
  refreshing: boolean;
  error: string | null;

  /** Aktif abonelikler, ödeme tarihi en yakın olan başta. */
  subscriptions: SubscriptionEnriched[];

  /** TRY satırı. Hiç TRY aboneliği yoksa null. */
  summary: DashboardSummary | null;
  /** TRY toplamı (yoksa 0). Özet kartının ana rakamı. */
  monthlyTotal: number;
  yearlyTotal: number;
  activeCount: number;

  /**
   * TRY dışı para birimlerinin özetleri.
   * Kur çevrimi bilinçli olarak yapılmaz — TRY ile USD'yi toplamak sessizce
   * yanlış bütçe rakamı üretir. Ekran bunları ayrı gösterir.
   */
  otherCurrencies: DashboardSummary[];

  /** Ödeme tarihi en yakın abonelik. */
  nextPayment: NextPayment | null;
  /** 30 gün içinde ödemesi gelenler. */
  upcomingPayments: SubscriptionEnriched[];
  /** 60 gün içinde taahhüdü bitenler. */
  endingContracts: SubscriptionEnriched[];

  /**
   * Abonelik bazında aylık harcama dağılımı — ana sayfa grafiği.
   * Her abonelik kendi dilimi: aynı kategorideki Netflix ve Exxen ayrı görünür.
   */
  subscriptionBreakdown: BreakdownSlice[];

  /**
   * Kategori bazında aylık harcama dağılımı — Analizler sekmesi.
   *
   * İkisi de yalnızca TRY. Özet kartı da TRY gösteriyor ve şema boyunca kur
   * çevrimi bilinçli olarak yapılmıyor; farklı para birimlerini tek pastada
   * toplamak sessizce yanlış bir dağılım çizerdi.
   */
  categoryBreakdown: BreakdownSlice[];

  /** Pull-to-refresh ve hata sonrası "Tekrar Dene" için. */
  refetch: () => Promise<void>;
}

export function useDashboard(): UseDashboardResult {
  const [subscriptions, setSubscriptions] = useState<SubscriptionEnriched[]>([]);
  const [summaries, setSummaries] = useState<DashboardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bileşen unmount olduktan sonra setState çağırmamak için.
  const mountedRef = useRef(true);
  // Yarış koşulu koruması: yavaş kalan eski istek, yeni sonucun üstüne yazmasın.
  const requestIdRef = useRef(0);

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    const requestId = ++requestIdRef.current;

    if (mode === 'initial') setLoading(true);
    else setRefreshing(true);

    try {
      // Oturum kontrolü — session yoksa RLS zaten boş döndürür ama o durumda
      // kullanıcıya "veri yok" yerine sessizce boş ekran göstermek daha doğru;
      // yönlendirmeyi app/_layout.tsx yapıyor.
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        if (mountedRef.current && requestId === requestIdRef.current) {
          setSubscriptions([]);
          setSummaries([]);
          setError(null);
        }
        return;
      }

      const [summaryRes, subsRes] = await Promise.all([
        supabase
          .from('v_dashboard_summary')
          .select('*'),

        supabase
          .from('v_subscriptions_enriched')
          .select('*')
          .in('status', ACTIVE_STATUSES)
          .order('next_payment_date', { ascending: true }),
      ]);

      // Eski istek geç geldiyse yok say.
      if (!mountedRef.current || requestId !== requestIdRef.current) return;

      if (summaryRes.error) throw summaryRes.error;
      if (subsRes.error) throw subsRes.error;

      setSummaries((summaryRes.data ?? []) as DashboardSummary[]);
      setSubscriptions((subsRes.data ?? []) as SubscriptionEnriched[]);
      setError(null);
    } catch (err: unknown) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;

      // Ham nesneyi logla — türetilmiş metni değil. PostgrestError'ın
      // code/details/hint alanları teşhis için mesajdan daha değerli.
      console.error('[useDashboard] Yükleme hatası:', err);
      setError(toErrorMessage(err));
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void load('initial');
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  const refetch = useCallback(async () => {
    await load('refresh');
  }, [load]);

  // ── Türetilmiş değerler ──────────────────────────────────────────────────
  // v_dashboard_summary para birimi başına BİR satır döndürür.
  const summary = summaries.find((s) => s.currency === 'TRY') ?? null;
  const otherCurrencies = summaries.filter((s) => s.currency !== 'TRY');

  const monthlyTotal = Number(summary?.monthly_total ?? 0);
  const yearlyTotal = Number(summary?.yearly_total ?? 0);

  // Tüm para birimlerindeki aktif abonelik sayısı — sayaçta kur sorunu yok.
  const activeCount = summaries.reduce(
    (total, s) => total + Number(s.active_count ?? 0),
    0,
  );

  // Liste zaten next_payment_date'e göre artan sıralı geliyor.
  const first = subscriptions[0];
  const nextPayment: NextPayment | null = first
    ? {
        subscription: first,
        date: first.next_payment_date,
        daysUntil: Number(first.days_until_payment ?? 0),
      }
    : null;

  const upcomingPayments = subscriptions.filter(
    (s) => Number(s.days_until_payment ?? 0) <= UPCOMING_PAYMENT_WINDOW_DAYS,
  );

  const endingContracts = subscriptions.filter(
    (s) =>
      s.contract_id !== null &&
      s.contract_days_left !== null &&
      s.contract_days_left >= 0 &&
      s.contract_days_left <= CONTRACT_ENDING_WINDOW_DAYS,
  );

  // ── Grafik dağılımları ───────────────────────────────────────────────────
  // Pastaya girecek satırlar: yalnızca TRY ve pozitif tutar.
  // (TRY kısıtının gerekçesi için bkz. categoryBreakdown açıklaması.)
  const chartable = subscriptions.filter(
    (s) => s.currency === 'TRY' && Number(s.monthly_amount ?? 0) > 0,
  );

  // Abonelik bazlı: her kayıt kendi dilimi, renk sırayla paletten.
  const subscriptionBreakdown = finalizeSlices(
    chartable.map((s, index) => ({
      key: s.id,
      name: s.name,
      icon: s.category_icon ?? null,
      color: SLICE_COLORS[index % SLICE_COLORS.length],
      amount: Number(s.monthly_amount),
      pct: 0,
    })),
  );

  // Kategori bazlı: aynı kategorideki abonelikler tek dilimde toplanır.
  const categoryBreakdown = finalizeSlices(
    [
      ...chartable
        .reduce((buckets, s) => {
          const key = s.category_id ?? UNCATEGORIZED_KEY;
          const existing = buckets.get(key);
          const amount = Number(s.monthly_amount);

          if (existing) {
            existing.amount += amount;
          } else {
            buckets.set(key, {
              key,
              name: s.category_name ?? 'Kategorisiz',
              icon: s.category_icon ?? null,
              // Kategorinin kendi DB rengi kartlardaki ikon rengiyle aynı;
              // dilim ile kart görsel olarak eşleşsin diye onu tercih ediyoruz.
              color:
                s.category_color ?? SLICE_COLORS[buckets.size % SLICE_COLORS.length],
              amount,
              pct: 0,
            });
          }

          return buckets;
        }, new Map<string, BreakdownSlice>())
        .values(),
    ],
  );

  return {
    loading,
    refreshing,
    error,
    subscriptions,
    summary,
    monthlyTotal,
    yearlyTotal,
    activeCount,
    otherCurrencies,
    nextPayment,
    upcomingPayments,
    endingContracts,
    subscriptionBreakdown,
    categoryBreakdown,
    refetch,
  };
}
