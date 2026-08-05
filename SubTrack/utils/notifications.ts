import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { formatCurrency, formatDate, parseISODate } from '../lib/format';
import type { Currency } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// Yerel hatırlatıcılar — expo-notifications (SDK 57)
//
// SDK 57 notları:
//  • setNotificationHandler'da shouldShowAlert KALDIRILDI; yerine
//    shouldShowBanner + shouldShowList geldi.
//  • Zamanlama tetikleyicisi artık tipli:
//    { type: SchedulableTriggerInputTypes.DATE, date }
//  • Uzak bildirim (push) Expo Go'da SDK 53'ten beri çalışmıyor ama YEREL
//    bildirim çalışıyor — bu dosya yalnızca yerel bildirim kuruyor.
//
// Web: expo-notifications'ın zamanlama tarafının web karşılığı yok (paket
// içinde scheduleNotificationAsync.web.js bulunmuyor), çağırmak native modüle
// düşüp hata veriyor. Bu yüzden web'de tüm fonksiyonlar sessizce no-op.
// ═══════════════════════════════════════════════════════════════════════════

const SUPPORTED = Platform.OS === 'ios' || Platform.OS === 'android';

const ANDROID_CHANNEL_ID = 'subtrack-reminders';

/** subscription.id → kurulmuş bildirim id'leri. */
const STORAGE_KEY = 'subtrack:reminder-ids';

/** Bildirime tıklanınca hangi aboneliğin açılacağını bilmek için taşınan veri. */
export interface ReminderData {
  subscriptionId: string;
  kind: 'payment' | 'contract';
}

/** Zamanlayıcının ihtiyaç duyduğu abonelik alanları. */
export interface ReminderSubscription {
  id: string;
  name: string;
  price: number;
  currency: Currency;
  /** YYYY-MM-DD */
  next_payment_date: string;
  /** YYYY-MM-DD — taahhüt yoksa null. */
  contract_end_date?: string | null;
}

// ── Kurulum ────────────────────────────────────────────────────────────────

/**
 * Uygulama açılışında bir kez çağrılır (app/_layout.tsx).
 * Bildirim ön plandayken de görünsün diye handler, Android'de kanal kurar.
 */
export async function configureNotifications(): Promise<void> {
  if (!SUPPORTED) return;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      // SDK 57: shouldShowAlert yerine bu ikisi.
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  if (Platform.OS === 'android') {
    // Android 8+ kanal olmadan bildirim göstermiyor.
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Abonelik hatırlatıcıları',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#7c3aed',
    });
  }
}

/**
 * İzin ister. Zaten verilmişse tekrar sormaz.
 * Kullanıcı reddederse false döner — çağıran taraf sessizce devam etmeli,
 * bildirim kurulamaması abonelik kaydını başarısız saymaz.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!SUPPORTED) return false;

  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;

  // canAskAgain false ise sistem diyaloğu bir daha açılmaz; kullanıcıyı
  // ayarlara yönlendirmek çağıranın işi.
  if (!current.canAskAgain) return false;

  const result = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: true },
  });
  return result.granted;
}

/** İzin durumunu değiştirmeden okur — Ayarlar ekranı için. */
export async function getNotificationPermissionStatus(): Promise<{
  supported: boolean;
  granted: boolean;
  canAskAgain: boolean;
}> {
  if (!SUPPORTED) return { supported: false, granted: false, canAskAgain: false };

  const current = await Notifications.getPermissionsAsync();
  return {
    supported: true,
    granted: current.granted,
    canAskAgain: current.canAskAgain,
  };
}

// ── id defteri ─────────────────────────────────────────────────────────────
// Bildirimleri güncellerken eskisini iptal etmemiz gerekiyor; expo tarafında
// "abonelik başına bildirim" diye bir kavram yok, eşlemeyi biz tutuyoruz.

async function readIdMap(): Promise<Record<string, string[]>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
  } catch (err) {
    console.error('[notifications] id defteri okunamadı:', err);
    return {};
  }
}

async function writeIdMap(map: Record<string, string[]>): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch (err) {
    console.error('[notifications] id defteri yazılamadı:', err);
  }
}

// ── Zamanlama ──────────────────────────────────────────────────────────────

/** Hatırlatma anı: hedef tarihten reminderDays gün önce, sabah 10:00. */
function reminderMoment(targetISO: string, reminderDays: number): Date | null {
  const target = parseISODate(targetISO);
  if (!target) return null;

  const moment = new Date(target);
  moment.setDate(moment.getDate() - reminderDays);
  // Gece yarısı yerine sabah: 00:00'da gelen bildirim fark edilmiyor.
  moment.setHours(10, 0, 0, 0);
  return moment;
}

/**
 * Bir aboneliğin hatırlatıcılarını (yeniden) kurar.
 *
 * Önce o aboneliğe ait eski bildirimleri iptal eder, sonra yenilerini kurar —
 * böylece güncelleme sonrası kullanıcı hem eski hem yeni tarih için bildirim
 * almaz.
 *
 * Geçmişte kalan tarihler atlanır: expo geçmiş bir tarihe kurulan bildirimi
 * anında gösteriyor, kullanıcı abonelik kaydeder kaydetmez alakasız bir uyarı
 * görürdü.
 *
 * @param reminderDays Kaç gün önce hatırlatılacağı. Çağıran taraf aboneliğin
 *   kendi `reminder_days_before` değerini geçer; o yoksa hesap varsayılanı
 *   (public.users.reminder_days) kullanılır.
 * @returns Kurulan bildirim sayısı. İzin yoksa ya da platform desteklemiyorsa 0.
 */
export async function scheduleSubscriptionReminder(
  subscription: ReminderSubscription,
  reminderDays: number,
): Promise<number> {
  if (!SUPPORTED) return 0;

  await cancelSubscriptionReminders(subscription.id);

  const granted = await ensureNotificationPermission();
  if (!granted) return 0;

  const now = Date.now();
  const amount = formatCurrency(subscription.price, subscription.currency);
  const scheduled: string[] = [];

  const jobs: { at: Date | null; title: string; body: string; kind: ReminderData['kind'] }[] = [
    {
      at: reminderMoment(subscription.next_payment_date, reminderDays),
      title: `${subscription.name} · ${amount}`,
      body:
        reminderDays === 0
          ? 'Ödeme bugün.'
          : `Ödeme ${reminderDays} gün sonra (${formatDate(subscription.next_payment_date, true)}).`,
      kind: 'payment',
    },
  ];

  if (subscription.contract_end_date) {
    jobs.push({
      at: reminderMoment(subscription.contract_end_date, reminderDays),
      title: `${subscription.name} taahhüdü bitiyor`,
      body: `Taahhüt bitişi ${formatDate(subscription.contract_end_date, true)}. Cayma bedeli olmadan çıkabilirsin.`,
      kind: 'contract',
    });
  }

  for (const job of jobs) {
    if (!job.at || job.at.getTime() <= now) continue;

    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: job.title,
          body: job.body,
          data: { subscriptionId: subscription.id, kind: job.kind } satisfies ReminderData,
        },
        trigger: {
          // SDK 57: tetikleyici tipli olmak zorunda.
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: job.at,
          ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
        },
      });
      scheduled.push(id);
    } catch (err) {
      console.error('[notifications] Bildirim kurulamadı:', err);
    }
  }

  if (scheduled.length > 0) {
    const map = await readIdMap();
    map[subscription.id] = scheduled;
    await writeIdMap(map);
  }

  return scheduled.length;
}

/** Aboneliğe ait tüm bildirimleri iptal eder (silme ve güncelleme öncesi). */
export async function cancelSubscriptionReminders(subscriptionId: string): Promise<void> {
  if (!SUPPORTED) return;

  const map = await readIdMap();
  const ids = map[subscriptionId];
  if (!ids?.length) return;

  await Promise.all(
    ids.map((id) =>
      Notifications.cancelScheduledNotificationAsync(id).catch((err) => {
        // Bildirim zaten gösterilmiş/iptal edilmiş olabilir; defterden
        // düşürmek yeterli, hata akışı durdurmasın.
        console.warn('[notifications] İptal edilemedi:', id, err);
      }),
    ),
  );

  delete map[subscriptionId];
  await writeIdMap(map);
}

/** Çıkış yaparken: başka hesabın bildirimleri bu cihazda kalmasın. */
export async function cancelAllReminders(): Promise<void> {
  if (!SUPPORTED) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error('[notifications] Tümü iptal edilemedi:', err);
  }
}
