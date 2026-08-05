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

/** Postgres undefined_column — kolon yok, migration çalıştırılmamış demek. */
const UNDEFINED_COLUMN = '42703';

function isUndefinedColumn(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === UNDEFINED_COLUMN
  );
}

export interface UseUserSettingsResult {
  reminderDays: number;
  loading: boolean;
  /** Kaydetme sürüyor — seçici bu sırada kilitlenir. */
  saving: boolean;
  error: string | null;
  /**
   * users.reminder_days kolonu yok — migration bekliyor.
   * Ayrı bir bayrak: bu durumda ekran çökmemeli ama "kaydedildi" gibi de
   * davranmamalı; seçici kilitlenip kullanıcıya ne yapması gerektiği söylenir.
   */
  migrationPending: boolean;
  /** Değeri anında DB'ye yazar. Başarısızsa eski değere döner. */
  setReminderDays: (days: number) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useUserSettings(): UseUserSettingsResult {
  const [reminderDays, setDays] = useState(DEFAULT_REMINDER_DAYS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [migrationPending, setMigrationPending] = useState(false);

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
      setMigrationPending(false);
      setError(null);
    } catch (err: unknown) {
      if (!mountedRef.current) return;

      // Kolon yoksa bu bir çalışma hatası değil, eksik migration. Ekranı
      // kilitlemek yerine varsayılanla devam edip durumu bildiriyoruz —
      // uygulamanın geri kalanı (form, bildirimler) çalışmaya devam etsin.
      if (isUndefinedColumn(err)) {
        console.warn(
          '[useUserSettings] users.reminder_days kolonu yok. ' +
            'supabase/migrations/20260805120000_users_reminder_days.sql çalıştırılmalı.',
        );
        setDays(DEFAULT_REMINDER_DAYS);
        setMigrationPending(true);
        setError(null);
        return;
      }

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
      // Kolon yokken yazmaya çalışmak boşuna: istek 400 döner ve seçici
      // bir an seçili görünüp geri atar. Kullanıcı zaten uyarıyı görüyor.
      if (migrationPending) return;

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
          if (isUndefinedColumn(err)) setMigrationPending(true);
          else setError(toErrorMessage(err));
        }
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [reminderDays, migrationPending],
  );

  return {
    reminderDays,
    loading,
    saving,
    error,
    migrationPending,
    setReminderDays,
    refetch: load,
  };
}
