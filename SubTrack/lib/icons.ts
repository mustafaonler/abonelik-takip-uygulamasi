// ═══════════════════════════════════════════════════════════════════════════
// İkonlar — lucide-react-native
//
// ⚠ Neden tek tek `lucide-react-native/icons/<ad>` yolundan alıyoruz:
// paketin kök barrel'ından (`from 'lucide-react-native'`) import etmek Metro'da
// TÜM ikon setini bundle'a sokuyor. Ölçüldü: barrel ile web bundle 998 → 2769
// modüle çıkıyordu; 5 ikon için ~1600 ikon taşımak anlamsız. Metro barrel
// export'ları tree-shake etmiyor.
//
// ⚠ İkon adları lucide 1.x'te değişti: `Home` → `House`, `PieChart` → `ChartPie`.
// Eski adlar sessizce undefined döner (render sırasında patlar), o yüzden yeni
// ikon eklerken adı `node_modules/lucide-react-native/dist/types/` altından
// doğrula. Dosya adları kebab-case.
// ═══════════════════════════════════════════════════════════════════════════

export { default as House } from 'lucide-react-native/icons/house';
export { default as BellRing } from 'lucide-react-native/icons/bell-ring';
export { default as ChartPie } from 'lucide-react-native/icons/chart-pie';
export { default as Plus } from 'lucide-react-native/icons/plus';
export { default as Settings } from 'lucide-react-native/icons/settings';
export { default as LogOut } from 'lucide-react-native/icons/log-out';
export { default as Mail } from 'lucide-react-native/icons/mail';
export { default as ShieldCheck } from 'lucide-react-native/icons/shield-check';
export { default as User } from 'lucide-react-native/icons/user';

export type { LucideIcon } from 'lucide-react-native';
