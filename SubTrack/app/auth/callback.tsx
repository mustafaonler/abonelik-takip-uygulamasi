import { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import type { Session } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────────────────────
// OAuth / Magic-Link Callback — /auth/callback
//
// Expo Router web'de supabase-js URL'yi göremez (Expo Router önce yakalar).
// Bu yüzden:
//   1) useLocalSearchParams → ?code= parametresini yakala
//   2) exchangeCodeForSession(code) → PKCE exchange → session oluştur → /(tabs)
//   3) Fallback: code yoksa getSession() + onAuthStateChange (sayfa yenileme vb.)
// ─────────────────────────────────────────────────────────────────────────────

async function syncUserToDatabase(session: Session): Promise<void> {
  const user = session.user;
  if (!user) return;

  const meta = user.user_metadata ?? {};

  const { error } = await supabase.from('users').upsert(
    {
      id:         user.id,
      email:      user.email ?? '',
      full_name:  meta.full_name ?? meta.name ?? null,
      avatar_url: meta.avatar_url ?? meta.picture ?? null,
    },
    { onConflict: 'id' },
  );

  if (error) {
    console.error('[Callback] DB upsert hatası:', error.message);
  } else {
    console.log('[Callback] ✅ Kullanıcı kaydedildi:', user.email);
  }
}

export default function AuthCallback() {
  const [status, setStatus] = useState('Kimlik doğrulanıyor...');

  // ── Adım 1: Expo Router hook'u ile URL'deki ?code= parametresini yakala ──────
  // Bu, window.location.search yerine Expo Router'ın kendi routing sistemini kullanır.
  const { code } = useLocalSearchParams<{ code?: string }>();

  useEffect(() => {
    // ── Teşhis logları ─────────────────────────────────────────────────────────
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[Callback] Callback anında Key:',
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
        ? `✅ MEVCUT (${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY.length} karakter)`
        : '❌ UNDEFINED',
    );
    console.log('[Callback] Callback URL:',
      typeof window !== 'undefined' ? window.location.href : '(native)',
    );
    console.log('[Callback] useLocalSearchParams code:',
      code ? `✅ MEVCUT (${String(code).length} karakter)` : '❌ YOK',
    );
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // ── OAuth / Supabase sunucu hatası kontrolü ────────────────────────────────
    try {
      const url = new URL(window.location.href);
      const oauthError = url.searchParams.get('error') || url.searchParams.get('error_code');
      if (oauthError) {
        const desc = url.searchParams.get('error_description') ?? '';
        console.error('[Callback] ❌ OAuth sunucu hatası:', oauthError, '-', desc);
        router.replace('/(auth)/login');
        return;
      }
    } catch (_) { /* native ortam */ }

    let navigated = false;

    const goToApp = async (session: Session) => {
      if (navigated) return;
      navigated = true;
      setStatus('Hesap kaydediliyor...');
      await syncUserToDatabase(session);
      console.log('[Callback] ✅ Yönlendiriliyor → /(tabs)');
      router.replace('/(tabs)');
    };

    const run = async () => {

      // ── Adım 2: PKCE Code Exchange (asıl yol) ─────────────────────────────────
      // URL'de ?code= varsa → exchangeCodeForSession ile oturuma çevir.
      if (code) {
        console.log('[Callback] PKCE ?code bulundu, exchange başlıyor...');
        setStatus('Kimlik doğrulanıyor...');

        try {
          const { data, error } = await supabase.auth.exchangeCodeForSession(String(code));

          console.log('[Callback] exchangeCodeForSession sonucu:', {
            hasSession: !!data?.session,
            userEmail:  data?.session?.user?.email ?? null,
            error: error
              ? { msg: error.message, status: (error as any).status, code: (error as any).code }
              : null,
          });

          if (error) {
            console.error('[Callback] ❌ exchangeCodeForSession hatası:',
              error.message,
              '| status:', (error as any).status,
              '| code:', (error as any).code,
            );
            router.replace('/(auth)/login');
            return;
          }

          if (data?.session) {
            await goToApp(data.session);
            return;
          }

          // Exchange başarılı ama session gelmedi — beklenmedik durum
          console.warn('[Callback] Exchange tamam ama session yok, getSession deneniyor...');
        } catch (err: any) {
          console.error('[Callback] ❌ exchangeCodeForSession beklenmeyen hata:', err?.message ?? err);
          router.replace('/(auth)/login');
          return;
        }
      }

      // ── Adım 3: Fallback — code yoksa mevcut session kontrol et ───────────────
      // (Sayfa yenileme, zaten giriş yapmış kullanıcı, magic-link hash akışı)
      try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          console.error('[Callback] ❌ getSession hatası:',
            error.message, '| status:', (error as any).status);
          if (!navigated) router.replace('/(auth)/login');
          return;
        }

        console.log('[Callback] getSession:',
          session ? `✅ ${session.user.email}` : 'session yok, onAuthStateChange bekleniyor...');

        if (session) {
          await goToApp(session);
        }
      } catch (err: any) {
        console.error('[Callback] ❌ getSession beklenmeyen hata:', err?.message ?? err);
        if (!navigated) router.replace('/(auth)/login');
      }
    };

    // ── Adım 3 devam: onAuthStateChange — son güvence ─────────────────────────
    // getSession boş dönerse ve SIGNED_IN event'i gelirse yakalıyoruz.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[Callback] Auth event:', event, '|', session?.user?.email ?? 'session yok');
        if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
          await goToApp(session);
        }
      },
    );

    run();

    return () => subscription.unsubscribe();
  }, [code]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#7c3aed" style={styles.spinner} />
      <Text style={styles.text}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0d0d1a',
    gap: 16,
  },
  spinner: {
    transform: [{ scale: 1.4 }],
  },
  text: {
    color: '#a78bfa',
    fontSize: 16,
    fontWeight: '500',
  },
});
