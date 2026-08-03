import { useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';
import { toErrorMessage } from '../lib/errors';
import type {
  Contract,
  CreateContractPayload,
  CreateSubscriptionPayload,
} from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// useSubscriptionMutations — abonelik + taahhüt yazma işlemleri
//
// Okuma useDashboard'da; yazma buraya ayrıldı çünkü form ekranı dashboard'ın
// iki view sorgusunu mount etmek zorunda kalmasın (kaydetmek için listeye
// ihtiyacı yok).
//
// Taahhüt ayrı tabloda olduğu için her işlem iki isteğe bölünüyor ve PostgREST
// üzerinde transaction yok. Ekleme sırasında ikinci istek patlarsa aboneliği
// geri alıyoruz; güncellemede tam geri alma mümkün değil (eski satırı geri
// yazmak yeni bir hata kaynağı olurdu), o yüzden önce taahhüdü, sonra
// aboneliği yazıyoruz — böylece yarım kalırsa kullanıcının gördüğü liste
// değişmemiş oluyor.
// ═══════════════════════════════════════════════════════════════════════════

export interface SaveInput {
  subscription: CreateSubscriptionPayload;
  /** null ⇒ taahhüt yok / kaldırılsın. */
  contract: Omit<CreateContractPayload, 'subscription_id'> | null;
}

export interface UseSubscriptionMutationsResult {
  saving: boolean;
  deleting: boolean;
  error: string | null;
  /** Yeni abonelik (+ taahhüt) oluşturur, id döner. */
  addSubscription: (input: SaveInput) => Promise<string>;
  /** Var olan aboneliği ve taahhüdünü günceller. */
  updateSubscription: (id: string, input: SaveInput) => Promise<void>;
  /** Aboneliği siler. Taahhüt ve fiyat geçmişi FK cascade ile gider. */
  deleteSubscription: (id: string) => Promise<void>;
  clearError: () => void;
}

async function requireUserId(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Oturum bulunamadı. Lütfen tekrar giriş yap.');
  return session.user.id;
}

export function useSubscriptionMutations(): UseSubscriptionMutationsResult {
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addSubscription = useCallback(async (input: SaveInput): Promise<string> => {
    setSaving(true);
    setError(null);

    let createdId: string | null = null;

    try {
      const userId = await requireUserId();

      const { data, error: subError } = await supabase
        .from('subscriptions')
        .insert({ ...input.subscription, user_id: userId })
        .select('id')
        .single();

      if (subError) throw subError;
      createdId = data.id as string;

      if (input.contract) {
        const { error: contractError } = await supabase.from('contracts').insert({
          ...input.contract,
          user_id: userId,
          subscription_id: createdId,
        });
        if (contractError) throw contractError;
      }

      return createdId;
    } catch (err: unknown) {
      console.error('[useSubscriptionMutations] Ekleme hatası:', err);

      // Taahhüt eklenemediyse yarım kalmış aboneliği geri al; yoksa kullanıcı
      // taahhütsüz bir kayıtla kalır ve bunu fark etmez.
      if (createdId) {
        const { error: cleanupError } = await supabase
          .from('subscriptions')
          .delete()
          .eq('id', createdId);

        if (cleanupError) {
          console.error('[useSubscriptionMutations] Geri alma başarısız:', cleanupError);
          throw new Error(
            'Taahhüt eklenemedi ve abonelik kaydı geri alınamadı. ' +
              'Ana ekrandan kontrol etmen gerekebilir.',
          );
        }
      }

      const message = toErrorMessage(err);
      setError(message);
      throw new Error(message);
    } finally {
      setSaving(false);
    }
  }, []);

  const updateSubscription = useCallback(
    async (id: string, input: SaveInput): Promise<void> => {
      setSaving(true);
      setError(null);

      try {
        const userId = await requireUserId();

        // Mevcut taahhüt var mı? Kullanıcı switch'i kapattıysa silmemiz gerekiyor.
        const { data: existing, error: readError } = await supabase
          .from('contracts')
          .select('id')
          .eq('subscription_id', id)
          .maybeSingle();

        if (readError) throw readError;

        const existingContract = existing as Pick<Contract, 'id'> | null;

        // Taahhüdü önce yaz: bu adım patlarsa abonelik satırı hiç değişmemiş
        // olur ve kullanıcı tutarlı bir kayıtla kalır.
        if (input.contract) {
          if (existingContract) {
            const { error: updateContractError } = await supabase
              .from('contracts')
              .update(input.contract)
              .eq('id', existingContract.id);
            if (updateContractError) throw updateContractError;
          } else {
            const { error: insertContractError } = await supabase
              .from('contracts')
              .insert({ ...input.contract, user_id: userId, subscription_id: id });
            if (insertContractError) throw insertContractError;
          }
        } else if (existingContract) {
          const { error: deleteContractError } = await supabase
            .from('contracts')
            .delete()
            .eq('id', existingContract.id);
          if (deleteContractError) throw deleteContractError;
        }

        const { error: subError } = await supabase
          .from('subscriptions')
          .update(input.subscription)
          .eq('id', id);

        if (subError) throw subError;
      } catch (err: unknown) {
        console.error('[useSubscriptionMutations] Güncelleme hatası:', err);
        const message = toErrorMessage(err);
        setError(message);
        throw new Error(message);
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const deleteSubscription = useCallback(async (id: string): Promise<void> => {
    setDeleting(true);
    setError(null);

    try {
      // contracts ve price_changes, subscription_id üzerinden ON DELETE CASCADE
      // tanımlı — ayrıca silmeye gerek yok.
      const { error: deleteError } = await supabase
        .from('subscriptions')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;
    } catch (err: unknown) {
      console.error('[useSubscriptionMutations] Silme hatası:', err);
      const message = toErrorMessage(err);
      setError(message);
      throw new Error(message);
    } finally {
      setDeleting(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    saving,
    deleting,
    error,
    addSubscription,
    updateSubscription,
    deleteSubscription,
    clearError,
  };
}
