// ═══════════════════════════════════════════════════════════════════════════
// Supabase hata çözümleme
//
// DİKKAT: supabase-js'in PostgrestError'ı bir Error ÖRNEĞİ DEĞİLDİR — düz bir
// nesnedir ({ message, details, hint, code }). `err instanceof Error` bu yüzden
// false döner ve gerçek mesaj kaybolur. Her yerde bu yardımcıyı kullanın.
// ═══════════════════════════════════════════════════════════════════════════

interface PostgrestErrorLike {
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  code?: unknown;
}

function asErrorLike(err: unknown): PostgrestErrorLike | null {
  if (typeof err === 'object' && err !== null) return err as PostgrestErrorLike;
  return null;
}

export function toErrorMessage(err: unknown): string {
  if (err instanceof Error && !asErrorLike(err)?.code) {
    // Ağ hatası, TypeError vb.
    return err.message;
  }

  const e = asErrorLike(err);
  if (!e) return 'Beklenmeyen bir hata oluştu.';

  const code = typeof e.code === 'string' ? e.code : '';
  const raw = typeof e.message === 'string' ? e.message : '';

  switch (code) {
    // Tablo/view yok (PGRST205: şema önbelleğinde bulunamadı, 42P01: undefined_table)
    case 'PGRST205':
    case '42P01':
      return (
        'Veritabanı tabloları bulunamadı. supabase/migrations altındaki SQL ' +
        'dosyaları henüz çalıştırılmamış olabilir (bkz. supabase/README.md).'
      );

    // Yetki reddedildi — GRANT veya RLS politikası eksik
    case '42501':
      return (
        'Veritabanı yetkisi reddedildi. RLS politikaları ya da GRANT ' +
        'tanımları eksik olabilir.'
      );

    // RLS politikası INSERT/UPDATE'i engelledi
    case '42P17':
    case 'PGRST116':
      return 'Bu kayda erişim yetkin yok.';

    case 'PGRST301':
      return 'Oturumun süresi doldu. Lütfen tekrar giriş yap.';

    // CHECK constraint ihlali — form doğrulaması kaçırmış demektir
    case '23514':
      return `Girilen değerler veritabanı kuralına takıldı: ${raw}`;

    // Benzersizlik ihlali (ör. bir aboneliğe ikinci taahhüt eklemek)
    case '23505':
      return 'Bu kayıt zaten mevcut.';

    default:
      break;
  }

  if (/failed to fetch|network request failed/i.test(raw)) {
    return 'Sunucuya bağlanılamadı. İnternet bağlantını kontrol et.';
  }

  if (raw) return code ? `${raw} (${code})` : raw;
  return 'Beklenmeyen bir hata oluştu.';
}
