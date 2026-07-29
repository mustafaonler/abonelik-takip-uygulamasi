import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

// ── Env değerlerini oku ─────────────────────────────────────────────────────
console.log("URL Okunuyor mu?:", !!process.env.EXPO_PUBLIC_SUPABASE_URL);
console.log("KEY Okunuyor mu?:", !!process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
console.log("KEY Uzunluğu:", process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.length);

// \r (Windows CRLF), \n, \t — bunlar apikey'e girerse 401 alırsın.
const supabaseUrl  = (process.env.EXPO_PUBLIC_SUPABASE_URL  ?? '').trim().replace(/[\r\n\t]/g, '');
const supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim().replace(/[\r\n\t]/g, '');

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase env vars. ' +
    'EXPO_PUBLIC_SUPABASE_URL ve EXPO_PUBLIC_SUPABASE_ANON_KEY .env dosyasında tanımlı olmalı.',
  );
}

// ── Runtime doğrulama ───────────────────────────────────────────────────────
// NOT: supabase-js v2.49+ sb_publishable_ formatını doğrudan kabul eder.
// Prefix kırpmak YAPMA — sunucu tam anahtarı bekler.
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('[Supabase] URL              :', supabaseUrl);
console.log('[Supabase] KEY uzunluğu     :', supabaseAnonKey.length, 'karakter');
console.log('[Supabase] KEY[0:20]        :', JSON.stringify(supabaseAnonKey.slice(0, 20)));
console.log('[Supabase] KEY[-8:]         :', JSON.stringify(supabaseAnonKey.slice(-8)));
console.log('[Supabase] sb_publishable_? :', supabaseAnonKey.startsWith('sb_publishable_') ? '✅ EVET (tam format)' : supabaseAnonKey.startsWith('eyJ') ? '✅ JWT format' : '❌ BİLİNMEYEN FORMAT');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// ── AsyncStorage (yalnızca native) ─────────────────────────────────────────
const getStorage = () => {
  if (Platform.OS !== 'web') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    return AsyncStorage;
  }
  return undefined; // web: Supabase kendi localStorage adapter'ını kullanır
};

// ── createClient — parametre sırası: 1=URL, 2=KEY(tam), 3=options ──────────
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: getStorage(),
    autoRefreshToken: true,
    persistSession: true,
    // PKCE flow — OAuth ve magic-link callback'i ?code= ile gelir.
    // detectSessionInUrl: false → Expo Router URL'i supabase-js'den önce yakalar,
    // code exchange'i callback.tsx içinde manuel yapıyoruz.
    flowType: 'pkce',
    detectSessionInUrl: false,
  },
});
