import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

// ── 1) Ham değerleri oku + gizli karakterleri temizle ──────────────────────────
// \r (Windows CRLF), \n, \t, boşluk — bunlardan herhangi biri apikey'e girerse 401 alırsın.
const supabaseUrl  = (process.env.EXPO_PUBLIC_SUPABASE_URL  ?? '').trim().replace(/[\r\n\t]/g, '');
const rawAnonKey   = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim().replace(/[\r\n\t]/g, '');

if (!supabaseUrl || !rawAnonKey) {
  throw new Error(
    'Missing Supabase env vars. ' +
    'EXPO_PUBLIC_SUPABASE_URL ve EXPO_PUBLIC_SUPABASE_ANON_KEY .env dosyasında tanımlı olmalı.'
  );
}

// ── 2) sb_publishable_ prefix'ini otomatik kırp ───────────────────────────────
// Supabase dashboard'u yeni projeler için anahtarı şu formatta gösteriyor:
//   sb_publishable_XXXXX.eyJpc3MiOiJ...
// REST API sunucusu apikey header'ında sadece JWT kısmını (eyJ...) kabul eder.
// .env'de tam anahtarı tutabilirsin; kod otomatik ayarlıyor.
const supabaseAnonKey = rawAnonKey.startsWith('sb_publishable_')
  ? rawAnonKey.split('.').slice(1).join('.')
  : rawAnonKey;

// ── 3) Runtime doğrulama — her başlatmada konsolda kontrol et ─────────────────
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('[Supabase] URL           :', supabaseUrl);
console.log('[Supabase] Raw key uzun. :', rawAnonKey.length, 'karakter');
console.log('[Supabase] JWT key uzun. :', supabaseAnonKey.length, 'karakter');
console.log('[Supabase] JWT[0:15]     :', JSON.stringify(supabaseAnonKey.slice(0, 15)));
console.log('[Supabase] JWT[-8:]      :', JSON.stringify(supabaseAnonKey.slice(-8)));
console.log('[Supabase] JWT eyJ mi?   :', supabaseAnonKey.startsWith('eyJ') ? '✅ EVET' : '❌ HAYIR — SORUN VAR!');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// ── AsyncStorage (yalnızca native) ────────────────────────────────────────────
const getStorage = () => {
  if (Platform.OS !== 'web') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    return AsyncStorage;
  }
  return undefined; // web: Supabase kendi localStorage adapter'ını kullanır
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: getStorage(),
    autoRefreshToken: true,
    persistSession: true,
    // PKCE flow — OAuth callback'i ?code= ile gelir, exchangeCodeForSession kullanılır.
    // detectSessionInUrl kapalı: URL'i callback.tsx manuel işliyor.
    flowType: 'pkce',
    detectSessionInUrl: false,
  },
});
