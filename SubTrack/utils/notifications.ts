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
if (SUPPORTED) {
  Notifications.setNotificationHandler({
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
  if (!SUPPORTED) return;

  // Handler modül seviyesinde kuruldu (yukarı bak); burada yalnızca async
  // olması gereken kanal kurulumu kalıyor.
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
  if (!SUPPORTED) return 0;

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

    const trigger: Notifications.NotificationTriggerInput =
      job.plan.kind === 'at'
        ? {
            // SDK 57: tetikleyici tipli olmak zorunda.
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: job.plan.date,
            ...channel,
          }
        : {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: job.plan.seconds,
            repeats: false,
            ...channel,
          };

    try {
      const id = await Notifications.scheduleNotificationAsync({
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

/**
 * Şu an kurulu olan bildirimleri okunur biçimde döndürür — test/teşhis içindir.
 * Ayarlar ekranından ya da konsoldan çağrılabilir.
 */
export async function listScheduledReminders(): Promise<
  { id: string; title: string; when: string }[]
> {
  if (!SUPPORTED) return [];

  const items = await Notifications.getAllScheduledNotificationsAsync();

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
  if (!SUPPORTED) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error('[notifications] Tümü iptal edilemedi:', err);
  }
}
