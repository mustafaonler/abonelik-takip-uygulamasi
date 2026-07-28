import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from '../../lib/supabase';

WebBrowser.maybeCompleteAuthSession();

const { width } = Dimensions.get('window');

// Kullanıcı senkronizasyonu _layout.tsx'teki syncUserToDatabase fonksiyonuna taşındı.
// Hem getSession() (web / sayfa yenileme) hem onAuthStateChange (native / sonraki girişler)
// kapsamındadır; burada tekrar tanımlamaya gerek yoktur.

export default function LoginScreen() {
  const [loading, setLoading] = React.useState(false);

  const logoScale    = useRef(new Animated.Value(0.8)).current;
  const logoOpacity  = useRef(new Animated.Value(0)).current;
  const cardY        = useRef(new Animated.Value(60)).current;
  const cardOpacity  = useRef(new Animated.Value(0)).current;
  const buttonScale  = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(logoScale,   { toValue: 1, friction: 5, tension: 60, useNativeDriver: true }),
      Animated.timing(logoOpacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(300),
        Animated.parallel([
          Animated.spring(cardY,      { toValue: 0, friction: 7, tension: 50, useNativeDriver: true }),
          Animated.timing(cardOpacity,{ toValue: 1, duration: 600, useNativeDriver: true }),
        ]),
      ]),
    ]).start();
  }, []);

  // ──────────────────────────────────────────────────────────
  // Google OAuth — Web
  // window.location.origin dinamik olarak mevcut port'u kullanır.
  // Supabase Dashboard → Redirect URLs'e hem 8081 hem 8082 ekle.
  // ──────────────────────────────────────────────────────────
  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);

      if (Platform.OS === 'web') {
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        console.log('[OAuth] redirectTo olarak gönderilecek origin:', origin);
        console.log('[OAuth] Mevcut tam URL:', typeof window !== 'undefined' ? window.location.href : 'N/A');

        const { data: oauthData, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            // callback.tsx bu URL'e yönlendirilecek ve kodu manual exchange edecek.
            // Supabase Dashboard → Redirect URLs'e http://localhost:8081/auth/callback eklenmeli.
            redirectTo: `${origin}/auth/callback`,
            queryParams: {
              access_type: 'offline',
              prompt: 'consent',
            },
          },
        });

        console.log('[OAuth] signInWithOAuth sonucu → data:', oauthData, '| error:', error);
        if (error) throw error;
        // Supabase sayfayı Google'a yönlendirir.
        // Geri döndüğünde /auth/callback sayfası kodu exchange eder.
        return;
      }

      // ── Native (iOS / Android) — PKCE ──────────────────────────────
      const redirectTo = makeRedirectUri({ scheme: 'subtrack', path: 'auth/callback' });

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          queryParams: { access_type: 'offline', prompt: 'consent' },
        },
      });

      if (error) throw error;
      if (!data?.url) throw new Error('OAuth URL alınamadı.');

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success' || !result.url) return;

      const parsed = new URL(result.url);

      // 1) PKCE: ?code=...
      // exchangeCodeForSession → onAuthStateChange SIGNED_IN fırlatır
      // → _layout.tsx syncUserToDatabase + router.replace('/(tabs)') çalışır.
      const code = parsed.searchParams.get('code');
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) throw exchangeError;
        // Yönlendirme ve senkronizasyon _layout.tsx tarafından yapılır.
        return;
      }

      // 2) Implicit: #access_token=...
      const hash       = parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash;
      const hashParams = new URLSearchParams(hash);
      const accessToken  = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');

      if (accessToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken ?? '',
        });
        if (sessionError) throw sessionError;
        // setSession → onAuthStateChange SIGNED_IN fırlatır
        // → _layout.tsx syncUserToDatabase + router.replace('/(tabs)') çalışır.
      }

    } catch (err: any) {
      console.error('[handleGoogleSignIn] Hata:', err.message);
      Alert.alert(
        'Giriş Başarısız',
        err.message ?? 'Bir hata oluştu, lütfen tekrar dene.',
      );
    } finally {
      setLoading(false);
    }
  };

  const onPressIn  = () => Animated.spring(buttonScale, { toValue: 0.96, useNativeDriver: true, friction: 8 }).start();
  const onPressOut = () => Animated.spring(buttonScale, { toValue: 1,    useNativeDriver: true, friction: 8 }).start();

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <View style={[styles.blob, styles.blobTopLeft]} />
      <View style={[styles.blob, styles.blobBottomRight]} />

      {/* Hero */}
      <Animated.View style={[styles.heroSection, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
        <View style={styles.logoContainer}>
          <Text style={styles.logoIcon}>◈</Text>
        </View>
        <Text style={styles.appName}>SubTrack</Text>
        <Text style={styles.tagline}>Tüm aboneliklerini{'\n'}tek ekranda yönet.</Text>
      </Animated.View>

      {/* Card */}
      <Animated.View style={[styles.card, { opacity: cardOpacity, transform: [{ translateY: cardY }] }]}>
        <Text style={styles.cardTitle}>Hemen Başla</Text>
        <Text style={styles.cardSubtitle}>Giriş yapmak için Google hesabını kullan.</Text>

        <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
          <TouchableOpacity
            style={styles.googleButton}
            onPress={handleGoogleSignIn}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            disabled={loading}
            activeOpacity={1}
          >
            {loading ? (
              <ActivityIndicator color="#1a1a2e" size="small" />
            ) : (
              <>
                <GoogleIcon />
                <Text style={styles.googleButtonText}>Google ile Devam Et</Text>
              </>
            )}
          </TouchableOpacity>
        </Animated.View>

        <Text style={styles.disclaimer}>
          Giriş yaparak{' '}
          <Text style={styles.disclaimerLink}>Kullanım Koşulları</Text>
          {'  '}ve{' '}
          <Text style={styles.disclaimerLink}>Gizlilik Politikası</Text>'nı
          kabul etmiş olursun.
        </Text>
      </Animated.View>
    </View>
  );
}

function GoogleIcon() {
  return (
    <View style={styles.googleIconWrapper}>
      <Text style={styles.googleIconText}>G</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d1a',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 60,
    paddingHorizontal: 24,
    overflow: 'hidden',
  },
  blob: { position: 'absolute', borderRadius: 999, opacity: 0.18 },
  blobTopLeft: {
    width: width * 0.9, height: width * 0.9,
    backgroundColor: '#7c3aed',
    top: -width * 0.35, left: -width * 0.25,
  },
  blobBottomRight: {
    width: width * 0.75, height: width * 0.75,
    backgroundColor: '#2563eb',
    bottom: -width * 0.2, right: -width * 0.2,
  },
  heroSection: { alignItems: 'center', marginTop: 40 },
  logoContainer: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: 'rgba(124, 58, 237, 0.25)',
    borderWidth: 1, borderColor: 'rgba(124, 58, 237, 0.5)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5, shadowRadius: 20, elevation: 12,
  },
  logoIcon:  { fontSize: 36, color: '#a78bfa' },
  appName:   { fontSize: 42, fontWeight: '800', color: '#f1f5f9', letterSpacing: -1, marginBottom: 12 },
  tagline:   { fontSize: 18, color: '#94a3b8', textAlign: 'center', lineHeight: 28 },
  card: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 28, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 24, paddingVertical: 32, alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.4, shadowRadius: 30, elevation: 16,
  },
  cardTitle:    { fontSize: 24, fontWeight: '700', color: '#f1f5f9', marginBottom: 8 },
  cardSubtitle: { fontSize: 15, color: '#64748b', marginBottom: 28, textAlign: 'center' },
  googleButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#ffffff', borderRadius: 16,
    paddingVertical: 16, paddingHorizontal: 32,
    width: width - 96, minHeight: 56, gap: 12,
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 14, elevation: 8,
  },
  googleButtonText: { fontSize: 16, fontWeight: '700', color: '#1a1a2e', letterSpacing: 0.2 },
  googleIconWrapper: {
    width: 24, height: 24, borderRadius: 4,
    backgroundColor: '#4285F4', alignItems: 'center', justifyContent: 'center',
  },
  googleIconText: { color: '#fff', fontWeight: '900', fontSize: 14, lineHeight: 17 },
  disclaimer:     { marginTop: 20, fontSize: 12, color: '#475569', textAlign: 'center', lineHeight: 18 },
  disclaimerLink: { color: '#7c3aed', fontWeight: '600' },
});
