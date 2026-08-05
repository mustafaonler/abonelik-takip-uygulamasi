import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

// ═══════════════════════════════════════════════════════════════════════════
// useCurrentUser — oturumdaki kullanıcının görüntülenecek bilgileri
//
// Google OAuth metadata anahtarları platforma göre değişiyor:
//   web    → name, picture
//   native → full_name, avatar_url
// (app/_layout.tsx'teki syncUserToDatabase da aynı iki ihtimali karşılıyor.)
//
// public.users tablosundan değil oturumdan okuyoruz: ekstra istek gerekmiyor
// ve profil satırı herhangi bir sebeple oluşmamışsa bile isim yine geliyor.
// ═══════════════════════════════════════════════════════════════════════════

export interface CurrentUser {
  id: string;
  email: string | null;
  /** Tam ad; metadata'da yoksa null. */
  fullName: string | null;
  /** Karşılamada kullanılacak kısa ad — tam adın ilk kelimesi. */
  firstName: string | null;
  avatarUrl: string | null;
}

export function useCurrentUser(): { user: CurrentUser | null; loading: boolean } {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    function apply(session: Awaited<
      ReturnType<typeof supabase.auth.getSession>
    >['data']['session']) {
      if (!mountedRef.current) return;

      if (!session?.user) {
        setUser(null);
        setLoading(false);
        return;
      }

      const meta = session.user.user_metadata ?? {};
      const fullName: string | null = meta.full_name ?? meta.name ?? null;

      setUser({
        id: session.user.id,
        email: session.user.email ?? null,
        fullName,
        firstName: fullName ? (fullName.trim().split(/\s+/)[0] ?? null) : null,
        avatarUrl: meta.avatar_url ?? meta.picture ?? null,
      });
      setLoading(false);
    }

    void supabase.auth.getSession().then(({ data }) => apply(data.session));

    // Oturum yenilenince (veya çıkış yapılınca) isim de güncellensin.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => apply(session),
    );

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
}

/** Saate göre karşılama sözü. */
export function greetingForHour(hour: number = new Date().getHours()): string {
  if (hour < 6) return 'İyi geceler';
  if (hour < 12) return 'Günaydın';
  if (hour < 18) return 'İyi günler';
  return 'İyi akşamlar';
}
