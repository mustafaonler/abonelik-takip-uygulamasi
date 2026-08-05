import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { toErrorMessage } from '../lib/errors';

// ═══════════════════════════════════════════════════════════════════════════
// useUserSettings — public.users üzerindeki hesap tercihleri
//
// Şimdilik tek alan: reminder_days (hatırlatma varsayılanı).
// RLS zaten satırı auth.uid()'e kısıtlıyor, sorguda kullanıcı filtresi yok.
// ═══════════════════════════════════════════════════════════════════════════

/** users.reminder_days yoksa kullanılacak değer — DB varsayılanıyla aynı. */
export const DEFAULT_REMINDER_DAYS = 3;

export interface UseUserSettingsResult {
  reminderDays: number;
  loading: boolean;
  /** Kaydetme sürüyor — seçici bu sırada kilitlenir. */
  saving: boolean;
  error: string | null;
  /** Değeri anında DB'ye yazar. Başarısızsa eski değere döner. */
  setReminderDays: (days: number) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useUserSettings(): UseUserSettingsResult {
  const [reminderDays, setDays] = useState(DEFAULT_REMINDER_DAYS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        if (mountedRef.current) setLoading(false);
        return;
      }

      const { data, error: readError } = await supabase
        .from('users')
        .select('reminder_days')
        .eq('id', session.user.id)
        .maybeSingle();

      if (!mountedRef.current) return;
      if (readError) throw readError;

      setDays(Number(data?.reminder_days ?? DEFAULT_REMINDER_DAYS));
      setError(null);
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      console.error('[useUserSettings] Yükleme hatası:', err);
      setError(toErrorMessage(err));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  const setReminderDays = useCallback(
    async (days: number) => {
      const previous = reminderDays;
      // İyimser güncelleme: seçicinin dokunma anında tepki vermesi için.
      setDays(days);
      setSaving(true);
      setError(null);

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Oturum bulunamadı. Lütfen tekrar giriş yap.');

        const { error: updateError } = await supabase
          .from('users')
          .update({ reminder_days: days })
          .eq('id', session.user.id);

        if (updateError) throw updateError;
      } catch (err: unknown) {
        console.error('[useUserSettings] Kaydetme hatası:', err);
        if (mountedRef.current) {
          // Yazma başarısızsa arayüz gerçeği yansıtsın, kaydedilmiş gibi durmasın.
          setDays(previous);
          setError(toErrorMessage(err));
        }
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [reminderDays],
  );

  return { reminderDays, loading, saving, error, setReminderDays, refetch: load };
}
