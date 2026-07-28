import { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import type { Session } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────────────────────
// OAuth Callback Sayfası — app/auth/callback.tsx → URL: /auth/callback
//
// PKCE flow (flowType: 'pkce'): ?code=XXX → exchangeCodeForSession
// Implicit fallback:           #access_token=XXX → setSession
// ─────────────────────────────────────────────────────────────────────────────

async function syncUserToDatabase(session: Session): Promise<void> {
  const user = session.user;
  if (!user) return;

  const meta = user.user_metadata ?? {};
  console.log('[Callback] syncUser user:', user.email, '| meta keys:', Object.keys(meta).join(', '));

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
    console.error('[Callback] syncUser hata:', error.message, '| code:', error.code);
  } else {
    console.log('[Callback] ✅ public.users kaydedildi →', user.email);
  }
}

export default function AuthCallback() {
  const [status, setStatus] = useState('Oturum açılıyor...');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const currentUrl = window.location.href;
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('[Callback] Sayfa URL\'i:', currentUrl);

        const url = new URL(currentUrl);

        // ── 0) OAuth / Supabase Sunucu Hatası ────────────────────────────────
        const oauthError     = url.searchParams.get('error') || url.searchParams.get('error_code');
        const oauthErrorDesc = url.searchParams.get('error_description');
        if (oauthError) {
          console.error('[Callback] ❌ OAuth sunucu hatası:', oauthError, '-', oauthErrorDesc);
          router.replace('/(auth)/login');
          return;
        }

        // ── 1) PKCE Flow: ?code=... (flowType: 'pkce' ile gelen) ─────────────
        const code = url.searchParams.get('code');
        if (code) {
          console.log('[Callback] PKCE ?code bulundu, exchangeCodeForSession çağrılıyor...');
          setStatus('Kimlik doğrulanıyor...');

          const { data, error } = await supabase.auth.exchangeCodeForSession(code);

          console.log('[Callback] exchangeCodeForSession sonucu:', {
            hasSession: !!data?.session,
            userEmail:  data?.session?.user?.email ?? null,
            error:      error ? { msg: error.message, status: (error as any).status } : null,
          });

          if (error) {
            console.error('[Callback] ❌ exchangeCodeForSession hatası:', error.message);
            router.replace('/(auth)/login');
            return;
          }
          if (data.session) {
            setStatus('Hesap kaydediliyor...');
            await syncUserToDatabase(data.session);
            console.log('[Callback] ✅ PKCE akışı başarılı! /(tabs) yönlendiriliyor.');
            router.replace('/(tabs)');
            return;
          }
        }

        // ── 2) Implicit Flow Fallback: #access_token=... ─────────────────────
        const rawHash   = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
        const hashParams = new URLSearchParams(rawHash);
        const accessToken  = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        console.log('[Callback] access_token var mı :', !!accessToken);
        console.log('[Callback] refresh_token var mı:', !!refreshToken);

        if (accessToken) {
          // Diagnostic: token tipini doğrula
          console.log('[Callback] access_token[0:20]:', accessToken.slice(0, 20));
          console.log('[Callback] access_token uzun.:', accessToken.length);
          console.log('[Callback] JWT formatı mı?   :', accessToken.startsWith('eyJ') ? '✅ EVET' : '❌ HAYIR');

          console.log('[Callback] setSession çağrılıyor...');
          setStatus('Oturum oluşturuluyor...');

          const { data, error } = await supabase.auth.setSession({
            access_token:  accessToken,
            refresh_token: refreshToken ?? '',
          });

          console.log('[Callback] setSession sonucu:', {
            hasSession: !!data?.session,
            userEmail:  data?.session?.user?.email ?? null,
            error:      error ? { msg: error.message, status: (error as any).status, code: (error as any).code } : null,
          });

          if (error) {
            console.error('[Callback] ❌ setSession hatası:', error.message, '| status:', (error as any).status);
            router.replace('/(auth)/login');
            return;
          }
          if (data.session) {
            setStatus('Hesap kaydediliyor...');
            await syncUserToDatabase(data.session);
            console.log('[Callback] ✅ Implicit akışı başarılı! /(tabs) yönlendiriliyor.');
            router.replace('/(tabs)');
            return;
          }
        }

        // ── 3) Ne code ne token var ───────────────────────────────────────────
        console.error('[Callback] ❌ URL\'de ne ?code ne de #access_token var:', currentUrl);
        router.replace('/(auth)/login');

      } catch (err: any) {
        console.error('[Callback] ❌ Beklenmeyen hata:', err?.message ?? err);
        router.replace('/(auth)/login');
      }
    };

    handleCallback();
  }, []);

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
