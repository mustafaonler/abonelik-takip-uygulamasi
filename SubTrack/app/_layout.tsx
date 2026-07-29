import { Stack, router } from 'expo-router';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────────────────────
// syncUserToDatabase — kullanıcıyı public.users tablosuna upsert ile kaydet.
// Google OAuth metadata key'leri farklı gelebilir:
//   web  → name, picture
//   native → full_name, avatar_url
// Session doğrudan parametre olarak alınır; ekstra network çağrısına gerek yok.
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
    console.error('[syncUserToDatabase] Hata:', error.message);
  } else {
    console.log('[syncUserToDatabase] public.users kaydı oluşturuldu/güncellendi →', user.email);
  }
}

export default function RootLayout() {
  useEffect(() => {
    // ── Tüm oturum yönetimi onAuthStateChange üzerinden yapılır ──────────────
    //
    // onAuthStateChange olayları:
    //   INITIAL_SESSION → Uygulama açılışında mevcut oturum
    //   SIGNED_IN       → Yeni giriş (native PKCE / callback.tsx exchange sonrası)
    //   SIGNED_OUT      → Çıkış
    //
    // Web'de /auth/callback sayfasındayken INITIAL_SESSION geldiğinde session
    // henüz yoktur (callback.tsx kodu exchange etmemiştir). Bu durumda login'e
    // gönderme; callback.tsx exchange tamamlayıp SIGNED_IN fırlatır.
    //
    const isOnCallbackPage =
      typeof window !== 'undefined' &&
      window.location.pathname.includes('/auth/callback');

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[Auth] event:', event, '| session:', session?.user?.email ?? 'yok');

        if (event === 'INITIAL_SESSION' && session && !isOnCallbackPage) {
          // Dönen kullanıcı — oturum localStorage'dan yüklendi.
          // Callback sayfasındaysak yönlendirme YAPMA; callback.tsx hallediyor.
          await syncUserToDatabase(session);
          router.replace('/(tabs)');
        } else if (event === 'INITIAL_SESSION' && !session && !isOnCallbackPage) {
          // Oturum yok ve callback sayfasında değiliz → login'e git
          router.replace('/(auth)/login');
        } else if (event === 'SIGNED_IN' && session && !isOnCallbackPage) {
          // Callback dışı SIGNED_IN (native PKCE, token yenileme vb.)
          // Callback sayfasındaki SIGNED_IN yok sayılır — callback.tsx kendi
          // syncUser + router.replace('/(tabs)') işlemini yapıyor.
          await syncUserToDatabase(session);
          router.replace('/(tabs)');
        } else if (event === 'SIGNED_OUT') {
          router.replace('/(auth)/login');
        }
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  );
}
