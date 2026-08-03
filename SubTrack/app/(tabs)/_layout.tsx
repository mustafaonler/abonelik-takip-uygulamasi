import { Tabs, router } from 'expo-router';
import { View, TouchableOpacity, Text, StyleSheet, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { COLORS, RADIUS } from '../../lib/theme';

// Sekme çubuğu yüksekliği = içerik + cihazın alt güvenli alanı.
// Sabit yükseklik verirsek gestür çubuğu olan telefonlarda ikonlar çubuğun
// altında kalıyor; insets.bottom'u ekleyip aynı miktarda iç boşluk veriyoruz.
const TAB_CONTENT_HEIGHT = 68;

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
          paddingTop: 8,
        },
        tabBarItemStyle: { paddingVertical: 4 },
        tabBarLabelStyle: { fontSize: 12.5, fontWeight: '700', marginTop: 4 },
        // Pasif ton COLORS.dim'den muted'a çekildi: dim koyu zeminde neredeyse
        // arka planla aynı, sekmenin var olduğu bile fark edilmiyordu.
        tabBarActiveTintColor: COLORS.primaryLight,
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
          tabBarLabel: 'Ana Sayfa',
          // İkon kütüphanesi kurulu değil; uygulama zaten kategorilerde emoji
          // kullanıyor, aynı dili sürdürüyoruz (ek bağımlılık ve font yükü yok).
          tabBarIcon: ({ color, focused }) => (
            <TabIcon glyph="◉" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: 'Yeni Ekle',
          tabBarLabel: 'Ekle',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon glyph="＋" color={color} focused={focused} />
          ),
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
      <Text style={[styles.tabIcon, { color }]}>{glyph}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  signOut: { marginRight: 16, paddingVertical: 6, paddingHorizontal: 4 },
  signOutText: { color: COLORS.primaryLight, fontWeight: '600', fontSize: 14 },

  tabIconWrap: {
    minWidth: 52,
    height: 30,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconWrapActive: { backgroundColor: COLORS.primarySoft },
  tabIcon: { fontSize: 24, lineHeight: 28, textAlign: 'center' },
});
