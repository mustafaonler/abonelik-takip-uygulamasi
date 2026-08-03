import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { toErrorMessage } from '../lib/errors';
import type { Contract, Subscription } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// useSubscriptionRecord — düzenleme modunda formu doldurmak için tek kayıt
//
// v_subscriptions_enriched yerine ham tablolardan okuyoruz: view cayma bedeli
// alanlarını (penalty_type, monthly_discount_amount, device_outstanding_amount,
// penalty_cap_amount) taşımıyor — özet için gerekmiyorlar. Form onları yazacağı
// için doğrudan contracts satırına ihtiyacı var.
// ═══════════════════════════════════════════════════════════════════════════

export interface SubscriptionRecord {
  subscription: Subscription;
  /** Taahhüdü yoksa null. */
  contract: Contract | null;
}

export interface UseSubscriptionRecordResult {
  record: SubscriptionRecord | null;
  loading: boolean;
  error: string | null;
  /** Kayıt bulunamadı (silinmiş ya da başka kullanıcıya ait — RLS gizler). */
  notFound: boolean;
  refetch: () => Promise<void>;
}

export function useSubscriptionRecord(id: string | null): UseSubscriptionRecordResult {
  const [record, setRecord] = useState<SubscriptionRecord | null>(null);
  const [loading, setLoading] = useState(id !== null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    if (!id) {
      setRecord(null);
      setLoading(false);
      setNotFound(false);
      return;
    }

    setLoading(true);
    try {
      const [subRes, contractRes] = await Promise.all([
        supabase.from('subscriptions').select('*').eq('id', id).maybeSingle(),
        supabase.from('contracts').select('*').eq('subscription_id', id).maybeSingle(),
      ]);

      if (!mountedRef.current) return;

      if (subRes.error) throw subRes.error;
      if (contractRes.error) throw contractRes.error;

      if (!subRes.data) {
        setRecord(null);
        setNotFound(true);
        setError(null);
        return;
      }

      setRecord({
        subscription: subRes.data as Subscription,
        contract: (contractRes.data as Contract | null) ?? null,
      });
      setNotFound(false);
      setError(null);
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      console.error('[useSubscriptionRecord] Yükleme hatası:', err);
      setError(toErrorMessage(err));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  return { record, loading, error, notFound, refetch: load };
}
