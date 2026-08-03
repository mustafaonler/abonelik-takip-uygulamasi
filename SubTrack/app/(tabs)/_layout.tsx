import { Tabs, router } from 'expo-router';
import { View, TouchableOpacity, Text, StyleSheet, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
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

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/(auth)/login');
  };

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

        headerRight: () => (
          <TouchableOpacity onPress={handleSignOut} style={styles.signOut}>
            <Text style={styles.signOutText}>Çıkış</Text>
          </TouchableOpacity>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Aboneliklerim',
          // İkon kütüphanesi kurulu değil; uygulama zaten kategorilerde emoji
          // kullanıyor, aynı dili sürdürüyoruz (ek bağımlılık ve font yükü yok).
          tabBarIcon: ({ color, focused }) => (
            <TabIcon glyph="◉" color={color} focused={focused} />
          ),
          tabBarLabel: ({ color }) => <TabLabel text="Ana Sayfa" color={color} />,
        }}
      />
      <Tabs.Screen
        name="analysis"
        options={{
          title: 'Analizler',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon glyph="◔" color={color} focused={focused} />
          ),
          tabBarLabel: ({ color }) => <TabLabel text="Analizler" color={color} />,
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: 'Yeni Ekle',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon glyph="＋" color={color} focused={focused} />
          ),
          tabBarLabel: ({ color }) => <TabLabel text="Ekle" color={color} />,
        }}
      />
    </Tabs>
  );
}

// Aktif sekmenin arkasına mor bir hap koyuyoruz: renk farkı tek başına koyu
// zeminde zayıf kalıyordu, dolgu hangi sekmede olduğunu bir bakışta belli ediyor.
function TabIcon({
  glyph,
  color,
  focused,
}: {
  glyph: string;
  color: ColorValue;
  focused: boolean;
}) {
  return (
    <View style={[styles.tabIconWrap, focused && styles.tabIconWrapActive]}>
      <Text style={[styles.tabIcon, { color }]} allowFontScaling={false}>
        {glyph}
      </Text>
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
  signOut: { marginRight: 16, paddingVertical: 6, paddingHorizontal: 4 },
  signOutText: { color: COLORS.primaryLight, fontWeight: '600', fontSize: 14 },

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
