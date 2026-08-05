import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Stack, router } from 'expo-router';
import { LogOut, Mail, ShieldCheck, User as UserIcon } from '../lib/icons';
import { supabase } from '../lib/supabase';
import { toErrorMessage } from '../lib/errors';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { COLORS, RADIUS } from '../lib/theme';

// ═══════════════════════════════════════════════════════════════════════════
// Ayarlar
//
// Çıkış eskiden her sekmenin başlığındaki "Çıkış" bağlantısındaydı; başlık
// ikona dönüşünce buraya taşındı. Uygulamadaki TEK çıkış yolu burası, o yüzden
// ekran sade de olsa var olmak zorunda.
// ═══════════════════════════════════════════════════════════════════════════

export default function SettingsScreen() {
  const { user, loading } = useCurrentUser();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut() {
    setSigningOut(true);
    setError(null);
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
      setConfirmSignOut(false);
      // Yönlendirmeyi app/_layout.tsx'teki onAuthStateChange da yapıyor;
      // burada da çağırmak, olay gecikirse ekranın asılı kalmasını önlüyor.
      router.replace('/(auth)/login');
    } catch (err: unknown) {
      console.error('[Settings] Çıkış hatası:', err);
      setConfirmSignOut(false);
      setError(toErrorMessage(err));
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: 'Ayarlar' }} />
      <StatusBar style="light" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.centerBlock}>
            <ActivityIndicator color={COLORS.primaryLight} />
          </View>
        ) : (
          <>
            {/* ── Hesap ── */}
            <View style={styles.profileCard}>
              {user?.avatarUrl ? (
                <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <UserIcon size={26} color={COLORS.primaryLight} strokeWidth={2} />
                </View>
              )}

              <Text style={styles.profileName} numberOfLines={1}>
                {user?.fullName ?? 'İsimsiz kullanıcı'}
              </Text>
              {user?.email && (
                <Text style={styles.profileEmail} numberOfLines={1}>
                  {user.email}
                </Text>
              )}
            </View>

            <Text style={styles.sectionTitle}>Hesap</Text>
            <View style={styles.card}>
              <Row
                icon={<Mail size={18} color={COLORS.muted} strokeWidth={2} />}
                label="E-posta"
                value={user?.email ?? '—'}
              />
              <View style={styles.rowDivider} />
              <Row
                icon={<ShieldCheck size={18} color={COLORS.muted} strokeWidth={2} />}
                label="Giriş yöntemi"
                value="Google"
              />
            </View>

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.signOutButton}
              onPress={() => setConfirmSignOut(true)}
              disabled={signingOut}
              activeOpacity={0.85}
            >
              <LogOut size={18} color={COLORS.danger} strokeWidth={2.2} />
              <Text style={styles.signOutText}>Oturumu Kapat</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      <ConfirmDialog
        visible={confirmSignOut}
        title="Oturumu kapat"
        message="Tekrar giriş yapman gerekecek. Abonelik verilerin silinmez."
        confirmLabel="Çıkış Yap"
        destructive
        busy={signingOut}
        onConfirm={handleSignOut}
        onCancel={() => setConfirmSignOut(false)}
      />
    </View>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.row}>
      {icon}
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const AVATAR = 72;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 20, paddingBottom: 40 },
  centerBlock: { paddingVertical: 60, alignItems: 'center' },

  profileCard: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 28,
    padding: 24,
    paddingBottom: 28,
  },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 },
  avatarFallback: {
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileName: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginTop: 14,
    textAlign: 'center',
  },
  profileEmail: { fontSize: 13.5, color: COLORS.dim, marginTop: 4, textAlign: 'center' },

  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primaryLight,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginTop: 26,
    marginBottom: 10,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 16,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15 },
  rowLabel: { fontSize: 14.5, color: COLORS.text, flexShrink: 0 },
  rowValue: { flex: 1, fontSize: 13.5, color: COLORS.muted, textAlign: 'right' },
  rowDivider: { height: 1, backgroundColor: COLORS.border },

  errorBox: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
    borderRadius: RADIUS.md,
    padding: 14,
    marginTop: 20,
  },
  errorText: { color: COLORS.danger, fontSize: 13.5, lineHeight: 20 },

  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    marginTop: 28,
    paddingVertical: 15,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.45)',
    backgroundColor: 'rgba(239,68,68,0.10)',
  },
  signOutText: { color: COLORS.danger, fontSize: 15, fontWeight: '700' },
});
