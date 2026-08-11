import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Platform,
  Linking,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { toErrorMessage } from '../../lib/errors';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Badge } from '../../components/ui';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { useUserSettings } from '../../hooks/useUserSettings';
import {
  cancelAllReminders,
  ensureNotificationPermission,
  getNotificationPermissionStatus,
} from '../../utils/notifications';
import { BellRing, LogOut, Mail, ShieldCheck, User as UserIcon } from '../../lib/icons';
import { COLORS, RADIUS } from '../../lib/theme';

// Seçenekler: "aynı gün" dâhil, çünkü bazı kullanıcılar sadece gün içinde
// haberdar olmak istiyor.
const REMINDER_OPTIONS = [0, 1, 3, 7, 14] as const;

function reminderLabel(days: number): string {
  if (days === 0) return 'Aynı gün';
  return `${days} gün önce`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Ayarlar
//
// Hatırlatma tercihi burada hesap geneli VARSAYILAN olarak tutuluyor
// (public.users.reminder_days). Abonelik formundaki "kaç gün önce hatırlat"
// alanı o aboneliğe özel değeri taşımaya devam ediyor ve bildirim kurulurken
// esas alınan o. Ayarı değiştirmek geçmiş abonelikleri geriye dönük değiştirmez.
// ═══════════════════════════════════════════════════════════════════════════

export default function SettingsScreen() {
  const { user, loading: userLoading } = useCurrentUser();
  const {
    reminderDays,
    loading: settingsLoading,
    saving,
    error,
    migrationPending,
    setReminderDays,
  } = useUserSettings();

  // Tipi elle yazmak yerine kaynağından türetiyoruz; yardımcı fonksiyon
  // değiştiğinde burası sessizce eskimesin.
  const [permission, setPermission] =
    useState<Awaited<ReturnType<typeof getNotificationPermissionStatus>> | null>(null);

  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  // Kullanıcı sistem ayarlarından izni değiştirip dönmüş olabilir.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void getNotificationPermissionStatus().then((status) => {
        if (active) setPermission(status);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  async function handleRequestPermission() {
    if (permission && !permission.canAskAgain) {
      // Sistem diyaloğu bir daha açılmaz; tek yol uygulama ayarları.
      void Linking.openSettings();
      return;
    }
    await ensureNotificationPermission();
    setPermission(await getNotificationPermissionStatus());
  }

  async function handleSignOut() {
    setSigningOut(true);
    setSignOutError(null);
    try {
      // Bu cihazda kurulu hatırlatıcılar bu hesaba aitti; bırakırsak bir
      // sonraki kullanıcı başkasının aboneliklerinin bildirimini alır.
      await cancelAllReminders();

      const { error: signOutErr } = await supabase.auth.signOut();
      if (signOutErr) throw signOutErr;

      setConfirmSignOut(false);
      router.replace('/(auth)/login');
    } catch (err: unknown) {
      console.error('[Settings] Çıkış hatası:', err);
      setConfirmSignOut(false);
      setSignOutError(toErrorMessage(err));
    } finally {
      setSigningOut(false);
    }
  }

  const loading = userLoading || settingsLoading;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.centerBlock}>
            <ActivityIndicator color={COLORS.primaryLight} />
          </View>
        ) : (
          <>
            {/* ── Profil ── */}
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

            {/* ── Hatırlatıcılar ── */}
            <Text style={styles.sectionTitle}>Hatırlatıcılar</Text>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <BellRing size={18} color={COLORS.primaryLight} strokeWidth={2} />
                <Text style={styles.cardTitle}>Ne zaman haber verelim?</Text>
              </View>
              <Text style={styles.cardHint}>
                Ödeme ve taahhüt bitiş tarihlerinden kaç gün önce bildirim
                göndereceğimizi belirler. Yeni eklediğin abonelikler bu değerle
                başlar; tek bir abonelik için farklı bir gün seçmek istersen
                abonelik formundan değiştirebilirsin.
              </Text>

              <View style={[styles.optionRow, migrationPending && styles.optionRowDisabled]}>
                {REMINDER_OPTIONS.map((days) => {
                  const selected = reminderDays === days;
                  return (
                    <TouchableOpacity
                      key={days}
                      style={[styles.option, selected && styles.optionSelected]}
                      onPress={() => void setReminderDays(days)}
                      disabled={saving || migrationPending}
                      activeOpacity={0.8}
                      accessibilityRole="radio"
                      accessibilityState={{ selected, disabled: migrationPending }}
                    >
                      <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                        {reminderLabel(days)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Kolon yoksa seçici kilitli: "seçtim ama kaydolmadı" durumunu
                  yaşatmak yerine ne yapılması gerektiğini söylüyoruz. */}
              {migrationPending && (
                <View style={styles.warnBoxInline}>
                  <Text style={styles.warnText}>
                    Bu ayar için veritabanı güncellemesi bekleniyor.
                    {'\n'}Supabase SQL Editor'da şunu çalıştır:
                    {'\n\n'}
                    <Text style={styles.code}>
                      alter table public.users add column if not exists reminder_days smallint not
                      null default 3;
                    </Text>
                    {'\n\n'}Tam dosya: supabase/migrations/20260805120000_users_reminder_days.sql
                  </Text>
                </View>
              )}

              {saving && <Text style={styles.savingText}>Kaydediliyor…</Text>}
              {error && <Text style={styles.inlineError}>{error}</Text>}
            </View>

            {/* ── İzin durumu ── */}
            {permission && !permission.supported ? (
              <View style={styles.noteBox}>
                <Text style={styles.noteText}>
                  {permission.availability === 'expo-go'
                    ? 'Expo Go bildirimleri desteklemiyor: expo-notifications, SDK 53 ile ' +
                      'Expo Go’dan çıkarıldı. Hatırlatıcılar burada kurulmuyor — ' +
                      'denemek için development build gerekiyor. Uygulamanın geri ' +
                      'kalanı normal çalışır.'
                    : 'Bildirimler yalnızca iOS ve Android’de çalışıyor. Web sürümünde ' +
                      'hatırlatıcı kurulmuyor.'}
                </Text>
              </View>
            ) : permission && !permission.granted ? (
              <TouchableOpacity
                style={styles.warnBox}
                onPress={handleRequestPermission}
                activeOpacity={0.85}
              >
                <Text style={styles.warnText}>
                  Bildirim izni verilmedi — hatırlatıcılar çalışmaz.
                  {permission.canAskAgain
                    ? ' İzin vermek için dokun.'
                    : ' Sistem ayarlarını açmak için dokun.'}
                </Text>
              </TouchableOpacity>
            ) : permission?.granted ? (
              <View style={styles.permissionOk}>
                <Badge label="Bildirim izni verildi" tone="success" icon="✓" />
              </View>
            ) : null}

            {/* ── Hesap ── */}
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

            {signOutError && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{signOutError}</Text>
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
        message="Tekrar giriş yapman gerekecek. Abonelik verilerin silinmez; bu cihazdaki hatırlatıcılar kaldırılır."
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
    padding: 16,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  cardHint: { fontSize: 12.5, color: COLORS.dim, lineHeight: 19, marginTop: 8 },

  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  optionRowDisabled: { opacity: 0.45 },
  option: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceStrong,
  },
  optionSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  optionText: { fontSize: 13, color: COLORS.muted, fontWeight: '600' },
  optionTextSelected: { color: '#fff', fontWeight: '700' },
  savingText: { fontSize: 12, color: COLORS.dim, marginTop: 10 },
  inlineError: { fontSize: 12.5, color: COLORS.danger, marginTop: 10, lineHeight: 18 },

  permissionOk: { marginTop: 12 },
  noteBox: {
    backgroundColor: COLORS.surfaceStrong,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: 13,
    marginTop: 12,
  },
  noteText: { color: COLORS.muted, fontSize: 12.5, lineHeight: 19 },
  warnBox: {
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.4)',
    borderRadius: RADIUS.md,
    padding: 13,
    marginTop: 12,
  },
  warnText: { color: COLORS.warn, fontSize: 12.5, lineHeight: 19 },
  warnBoxInline: {
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.4)',
    borderRadius: RADIUS.md,
    padding: 13,
    marginTop: 14,
  },
  code: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 11.5,
    color: COLORS.text,
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
