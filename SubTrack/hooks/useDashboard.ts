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
    refetch,
  };
}
