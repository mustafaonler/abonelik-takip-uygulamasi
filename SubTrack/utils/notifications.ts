import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { formatCurrency, formatDate, parseISODate } from '../lib/format';
import type { Currency } from '../types';

// Yalnızca TİP importu — derlemede silinir, çalışma anında paket yüklenmez.
// Statik import kullanmak Expo Go'da uygulamayı komple çökertiyor (aşağıya bak).
import type * as NotificationsModule from 'expo-notifications';

// ═══════════════════════════════════════════════════════════════════════════
// Yerel hatırlatıcılar — expo-notifications (SDK 57)
//
// ⚠ EXPO GO'DA PAKETİ IMPORT ETMEK UYGULAMAYI ÇÖKERTİYOR
// Android'de Expo Go, expo-notifications yüklenir yüklenmez şunu fırlatıyor:
//   "Android Push notifications (remote notifications) ... was removed from
//    Expo Go with the release of SDK 53. Use a development build instead."
// Hata import satırında oluşuyor; app/_layout.tsx değerlendirilemiyor ve
// expo-router route modülünü undefined alıp "Cannot read property
// 'ErrorBoundary' of undefined" ile ikinci kez patlıyor. Yani sadece
// bildirimler değil, TÜM uygulama açılmıyor.
//
// Dokümanın "yerel bildirimler Expo Go'da çalışmaya devam ediyor" ifadesi
// yanıltıcı: modülü yüklemek bile mümkün değil, dolayısıyla yerel bildirim de
// kullanılamıyor. Gerçek çözüm development build.
//
// Bu yüzden paket STATİK olarak import edilmiyor; yalnızca desteklenen
// ortamda require() ile yükleniyor. Desteklenmeyen ortamda (web, Expo Go)
// tüm fonksiyonlar sessizce no-op — uygulamanın geri kalanı çalışmaya devam
// ediyor ve Ayarlar ekranı kullanıcıya sebebini söylüyor.
//
// SDK 57 notları:
//  • setNotificationHandler'da shouldShowAlert @deprecated; zorunlu alanlar
//    shouldShowBanner + shouldShowList.
//  • Tetikleyici tipli olmak zorunda:
//    { type: SchedulableTriggerInputTypes.DATE, date }
// ═══════════════════════════════════════════════════════════════════════════

/** Bildirimlerin neden kullanılamadığı — Ayarlar ekranı bunu gösteriyor. */
export type NotificationAvailability = 'available' | 'web' | 'expo-go';

const IS_NATIVE = Platform.OS === 'ios' || Platform.OS === 'android';

/**
 * Expo Go içinde miyiz? SDK 50+ için önerilen kontrol bu;
 * Constants.appOwnership kullanımdan kaldırılıyor.
 */
const IS_EXPO_GO =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export const notificationAvailability: NotificationAvailability = !IS_NATIVE
  ? 'web'
  : IS_EXPO_GO
    ? 'expo-go'
    : 'available';

const SUPPORTED = notificationAvailability === 'available';

/**
 * Paketi ilk ihtiyaçta yükler. Desteklenmeyen ortamda null döner ve ASLA
 * require() çağırmaz — çökme tam olarak orada oluşuyor.
 */
let cached: typeof NotificationsModule | null = null;
let loadFailed = false;

function getNotifications(): typeof NotificationsModule | null {
  if (!SUPPORTED || loadFailed) return null;
  if (cached) return cached;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('expo-notifications') as typeof NotificationsModule;
    return cached;
  } catch (err) {
    // Beklenmedik bir ortam: bir kez logla, sonra sessizce devre dışı kal.
    loadFailed = true;
    console.error('[notifications] Paket yüklenemedi:', err);
    return null;
  }
}

const ANDROID_CHANNEL_ID = 'subtrack-reminders';

/**
 * Hatırlatma saati. Gece yarısı düşen bildirim fark edilmiyor; sabah 10:00
 * makul bir uzlaşma.
 */
const REMINDER_HOUR = 10;

/**
 * Hesaplanan an çoktan geçmişse bildirimi bu kadar saniye sonra gönderiyoruz.
 * 0 değil: kaydetme akışı bitmeden bildirim düşerse kullanıcı formu kapatırken
 * ekranın üstünde beliriyor, hangi kayda ait olduğu karışıyor.
 */
const IMMEDIATE_DELAY_SECONDS = 10;

// ── Ön plan davranışı ──────────────────────────────────────────────────────
// Modül seviyesinde: handler'ın herhangi bir bileşen mount olmadan ÖNCE
// kayıtlı olması gerekiyor, yoksa uygulama açılırken düşen bir bildirim
// varsayılan davranışa (ön planda gösterilmeme) takılır.
//
// SDK 57: shouldShowAlert @deprecated ve opsiyonel; shouldShowBanner ve
// shouldShowList ZORUNLU. Eski anahtarı eklemek işe yaramaz.
{
  const N = getNotifications();
  N?.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

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
  const N = getNotifications();
  if (!N) {
    if (notificationAvailability === 'expo-go') {
      console.warn(
        '[notifications] Expo Go içindesin: expo-notifications yüklenemiyor, ' +
          'hatırlatıcılar devre dışı. Test için development build gerekiyor.',
      );
    }
    return;
  }

  // Handler modül seviyesinde kuruldu (yukarı bak); burada yalnızca async
  // olması gereken kanal kurulumu kalıyor.
  if (Platform.OS === 'android') {
    // Android 8+ kanal olmadan bildirim göstermiyor.
    await N.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Abonelik hatırlatıcıları',
      importance: N.AndroidImportance.DEFAULT,
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
  const N = getNotifications();
  if (!N) return false;

  const current = await N.getPermissionsAsync();
  if (current.granted) return true;

  // canAskAgain false ise sistem diyaloğu bir daha açılmaz; kullanıcıyı
  // ayarlara yönlendirmek çağıranın işi.
  if (!current.canAskAgain) return false;

  // Android 13+ POST_NOTIFICATIONS izni bu çağrıyla isteniyor; paket izni
  // kendi AndroidManifest'inde tanımlıyor, ek yapılandırma gerekmiyor.
  const result = await N.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: true },
  });
  return result.granted;
}

/** İzin durumunu değiştirmeden okur — Ayarlar ekranı için. */
export async function getNotificationPermissionStatus(): Promise<{
  supported: boolean;
  /** Desteklenmiyorsa sebebi — ekranda ne yazacağını belirler. */
  availability: NotificationAvailability;
  granted: boolean;
  canAskAgain: boolean;
}> {
  const N = getNotifications();
  if (!N) {
    return {
      supported: false,
      availability: notificationAvailability,
      granted: false,
      canAskAgain: false,
    };
  }

  const current = await N.getPermissionsAsync();
  return {
    supported: true,
    availability: 'available',
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

/** Bir bildirimin ne zaman kurulacağına dair karar. */
type SchedulePlan =
  | { kind: 'at'; date: Date }
  | { kind: 'soon'; seconds: number }
  | { kind: 'skip'; reason: string };

/**
 * Hatırlatma zamanını hesaplar.
 *
 * Kural, kaçırmamak üzerine kurulu:
 *   1. Hedef gün tamamen geçtiyse → atla. Ödemesi dünkü bir abonelik için
 *      bugün "3 gün sonra ödeme var" demek yanlış olur.
 *   2. Hedef gün hâlâ önümüzdeyse ama hatırlatma anı (hedef − N gün, 10:00)
 *      geçmişse → HEMEN gönder. Eski davranış burada bildirimi sessizce
 *      atlıyordu: 5 Ağustos 15:35'te, 8 Ağustos ödemesi için 3 günlük
 *      hatırlatma "5 Ağustos 10:00"a denk geliyor ve hiç kurulmuyordu.
 *   3. Hatırlatma anı gelecekteyse → o ana kur.
 */
function planReminder(targetISO: string, reminderDays: number): SchedulePlan {
  const target = parseISODate(targetISO);
  if (!target) return { kind: 'skip', reason: 'tarih çözümlenemedi' };

  const now = Date.now();

  // Hedef günün SONU: ödeme günü henüz bitmediyse hatırlatmak hâlâ anlamlı.
  const targetEnd = new Date(target);
  targetEnd.setHours(23, 59, 59, 999);
  if (targetEnd.getTime() < now) {
    return { kind: 'skip', reason: 'hedef tarih geçmiş' };
  }

  const moment = new Date(target);
  moment.setDate(moment.getDate() - reminderDays);
  moment.setHours(REMINDER_HOUR, 0, 0, 0);

  if (moment.getTime() > now) return { kind: 'at', date: moment };

  return { kind: 'soon', seconds: IMMEDIATE_DELAY_SECONDS };
}

/**
 * Bir aboneliğin hatırlatıcılarını (yeniden) kurar.
 *
 * Önce o aboneliğe ait eski bildirimleri iptal eder, sonra yenilerini kurar —
 * böylece güncelleme sonrası kullanıcı hem eski hem yeni tarih için bildirim
 * almaz.
 *
 * Zamanlama kuralı için bkz. planReminder(): hatırlatma anı geçmiş ama hedef
 * tarih hâlâ önümüzdeyse bildirim atlanmaz, hemen gönderilir.
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
  const N = getNotifications();
  if (!N) return 0;

  await cancelSubscriptionReminders(subscription.id);

  const granted = await ensureNotificationPermission();
  if (!granted) return 0;

  const amount = formatCurrency(subscription.price, subscription.currency);
  const scheduled: string[] = [];

  const jobs: {
    plan: SchedulePlan;
    title: string;
    body: string;
    kind: ReminderData['kind'];
  }[] = [
    {
      plan: planReminder(subscription.next_payment_date, reminderDays),
      title: `${subscription.name} · ${amount}`,
      body:
        reminderDays === 0
          ? 'Ödeme bugün.'
          : `Ödeme tarihi ${formatDate(subscription.next_payment_date, true)}.`,
      kind: 'payment',
    },
  ];

  if (subscription.contract_end_date) {
    jobs.push({
      plan: planReminder(subscription.contract_end_date, reminderDays),
      title: `${subscription.name} taahhüdü bitiyor`,
      body: `Taahhüt bitişi ${formatDate(subscription.contract_end_date, true)}. Cayma bedeli olmadan çıkabilirsin.`,
      kind: 'contract',
    });
  }

  for (const job of jobs) {
    if (job.plan.kind === 'skip') {
      console.log(`[notifications] ${job.kind} atlandı: ${job.plan.reason}`);
      continue;
    }

    // Android'de kanal her iki tetikleyici tipinde de trigger üzerinden veriliyor.
    const channel = Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {};

    const trigger: NotificationsModule.NotificationTriggerInput =
      job.plan.kind === 'at'
        ? {
            // SDK 57: tetikleyici tipli olmak zorunda.
            type: N.SchedulableTriggerInputTypes.DATE,
            date: job.plan.date,
            ...channel,
          }
        : {
            type: N.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: job.plan.seconds,
            repeats: false,
            ...channel,
          };

    try {
      const id = await N.scheduleNotificationAsync({
        content: {
          title: job.title,
          body: job.body,
          data: { subscriptionId: subscription.id, kind: job.kind } satisfies ReminderData,
        },
        trigger,
      });
      scheduled.push(id);

      console.log(
        `[notifications] ${job.kind} kuruldu:`,
        job.plan.kind === 'at'
          ? job.plan.date.toLocaleString('tr-TR')
          : `${job.plan.seconds} sn sonra (hatırlatma anı geçmişti)`,
      );
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
  const N = getNotifications();
  if (!N) return;

  const map = await readIdMap();
  const ids = map[subscriptionId];
  if (!ids?.length) return;

  await Promise.all(
    ids.map((id) =>
      N.cancelScheduledNotificationAsync(id).catch((err) => {
        // Bildirim zaten gösterilmiş/iptal edilmiş olabilir; defterden
        // düşürmek yeterli, hata akışı durdurmasın.
        console.warn('[notifications] İptal edilemedi:', id, err);
      }),
    ),
  );

  delete map[subscriptionId];
  await writeIdMap(map);
}

/**
 * Şu an kurulu olan bildirimleri okunur biçimde döndürür — test/teşhis içindir.
 * Ayarlar ekranından ya da konsoldan çağrılabilir.
 */
export async function listScheduledReminders(): Promise<
  { id: string; title: string; when: string }[]
> {
  const N = getNotifications();
  if (!N) return [];

  const items = await N.getAllScheduledNotificationsAsync();

  return items.map((item) => {
    const trigger = item.trigger as { type?: string; value?: number; seconds?: number } | null;
    let when = 'bilinmiyor';

    if (trigger?.type === 'date' && typeof trigger.value === 'number') {
      when = new Date(trigger.value).toLocaleString('tr-TR');
    } else if (trigger?.type === 'timeInterval' && typeof trigger.seconds === 'number') {
      when = `${trigger.seconds} sn sonra`;
    }

    return { id: item.identifier, title: item.content.title ?? '(başlıksız)', when };
  });
}

/** Çıkış yaparken: başka hesabın bildirimleri bu cihazda kalmasın. */
export async function cancelAllReminders(): Promise<void> {
  const N = getNotifications();
  if (!N) return;
  try {
    await N.cancelAllScheduledNotificationsAsync();
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error('[notifications] Tümü iptal edilemedi:', err);
  }
}
