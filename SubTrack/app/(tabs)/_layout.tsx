import { Tabs, router } from 'expo-router';
import { View, TouchableOpacity, Text, StyleSheet, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChartPie, House, Plus, Settings, type LucideIcon } from '../../lib/icons';
import { useCurrentUser, greetingForHour } from '../../hooks/useCurrentUser';
import { COLORS, RADIUS } from '../../lib/theme';

// ═══════════════════════════════════════════════════════════════════════════
// Sekme çubuğu yüksekliği
//
// Toplam yükseklik = içerik + cihazın alt güvenli alanı (gestür çubuğu).
// Aynı miktar paddingBottom olarak da veriliyor, yoksa içerik güvenli alanın
// altına iniyor.
//
// İçerik bütçesi (TAB_CONTENT_HEIGHT = 78):
//   paddingTop        10
//   ikon hapı         34
//   etiket boşluğu     2
//   etiket satırı     16
//   ─────────────────────
//   toplam            62   → 16px pay kalıyor
//
// Önceki değer 68'di ve bütçe 66 kullanıyordu; 2px pay, sistem yazı tipi
// büyütülünce etiketi çubuğun dışına taşırıyordu. Etiketi ayrıca
// allowFontScaling={false} ile sabitledik — erişilebilirlik ayarı 2 katına
// çıktığında tek satırlık etiketin taşmaması, okunmaması riskinden iyi.
// ═══════════════════════════════════════════════════════════════════════════
const TAB_CONTENT_HEIGHT = 78;

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.bg },
        headerTintColor: COLORS.text,
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: COLORS.bg },

        tabBarStyle: {
          backgroundColor: COLORS.bg,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          height: TAB_CONTENT_HEIGHT + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 10,
        },
        // Öğenin kendi dikey boşluğu yok: tüm dikey ölçü tabBarStyle'dan
        // yönetiliyor ki bütçe tek yerde kalsın.
        tabBarItemStyle: { paddingVertical: 0 },
        tabBarActiveTintColor: COLORS.primaryLight,
        // Pasif ton dim → muted: dim koyu zeminde arka planla neredeyse aynı,
        // sekmenin var olduğu bile zor fark ediliyordu.
        tabBarInactiveTintColor: COLORS.muted,

        headerRight: () => <SettingsButton />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          // Sabit "Aboneliklerim" başlığı kaldırıldı: aynı metin sayfanın
          // içindeki liste başlığında zaten var, tekrar ediyordu.
          headerTitle: () => <GreetingTitle />,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon Icon={House} color={color} focused={focused} />
          ),
          tabBarLabel: ({ color }) => <TabLabel text="Ana Sayfa" color={color} />,
        }}
      />
      <Tabs.Screen
        name="analysis"
        options={{
          title: 'Analizler',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon Icon={ChartPie} color={color} focused={focused} />
          ),
          tabBarLabel: ({ color }) => <TabLabel text="Analizler" color={color} />,
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: 'Yeni Ekle',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon Icon={Plus} color={color} focused={focused} />
          ),
          tabBarLabel: ({ color }) => <TabLabel text="Ekle" color={color} />,
        }}
      />
    </Tabs>
  );
}

/**
 * Ana sayfa başlığı: saate ve kullanıcının adına göre karşılama.
 * İsim gelmeden önce yalnızca karşılamayı gösteriyoruz — "Merhaba, undefined"
 * ya da bir anlık boşluk yerine cümle her durumda tam kalsın.
 */
function GreetingTitle() {
  const { user } = useCurrentUser();
  const greeting = greetingForHour();

  return (
    <Text style={styles.greeting} numberOfLines={1}>
      {user?.firstName ? `${greeting}, ${user.firstName} 👋` : `${greeting} 👋`}
    </Text>
  );
}

function SettingsButton() {
  return (
    <TouchableOpacity
      onPress={() => router.push('/settings')}
      style={styles.headerButton}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityLabel="Ayarlar"
    >
      <Settings size={22} color={COLORS.primaryLight} strokeWidth={2} />
    </TouchableOpacity>
  );
}

// Aktif sekmenin arkasına mor bir hap koyuyoruz: renk farkı tek başına koyu
// zeminde zayıf kalıyordu, dolgu hangi sekmede olduğunu bir bakışta belli ediyor.
function TabIcon({
  Icon,
  color,
  focused,
}: {
  Icon: LucideIcon;
  color: ColorValue;
  focused: boolean;
}) {
  return (
    <View style={[styles.tabIconWrap, focused && styles.tabIconWrapActive]}>
      {/* lucide `color` prop'u string bekliyor; tabBarIcon ColorValue veriyor.
          Pratikte hep hex geliyor, tip uyumu için daraltıyoruz. */}
      <Icon size={22} color={String(color)} strokeWidth={focused ? 2.4 : 2} />
    </View>
  );
}

function TabLabel({ text, color }: { text: string; color: ColorValue }) {
  return (
    <Text style={[styles.tabLabel, { color }]} allowFontScaling={false} numberOfLines={1}>
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  headerButton: { marginRight: 16, padding: 4 },
  greeting: { fontSize: 17, fontWeight: '700', color: COLORS.text },

  tabIconWrap: {
    minWidth: 60,
    height: 34,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconWrapActive: { backgroundColor: COLORS.primarySoft },
  tabIcon: { fontSize: 24, lineHeight: 28, textAlign: 'center' },

  tabLabel: {
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: '700',
    marginTop: 2,
    textAlign: 'center',
  },
});
