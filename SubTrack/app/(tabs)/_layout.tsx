import { Tabs, router } from 'expo-router';
import { TouchableOpacity, Text, StyleSheet, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { COLORS } from '../../lib/theme';

// Sekme çubuğu yüksekliği = içerik + cihazın alt güvenli alanı.
// Sabit yükseklik verirsek gestür çubuğu olan telefonlarda ikonlar çubuğun
// altında kalıyor; insets.bottom'u ekleyip aynı miktarda iç boşluk veriyoruz.
const TAB_CONTENT_HEIGHT = 60;

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
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600', marginTop: 2 },
        tabBarActiveTintColor: COLORS.primaryLight,
        tabBarInactiveTintColor: COLORS.dim,

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
          tabBarIcon: ({ color }) => <TabIcon glyph="◉" color={color} />,
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: 'Yeni Ekle',
          tabBarLabel: 'Ekle',
          tabBarIcon: ({ color }) => <TabIcon glyph="＋" color={color} />,
        }}
      />
    </Tabs>
  );
}

function TabIcon({ glyph, color }: { glyph: string; color: ColorValue }) {
  return <Text style={[styles.tabIcon, { color }]}>{glyph}</Text>;
}

const styles = StyleSheet.create({
  signOut: { marginRight: 16, paddingVertical: 6, paddingHorizontal: 4 },
  signOutText: { color: COLORS.primaryLight, fontWeight: '600', fontSize: 14 },
  tabIcon: { fontSize: 20, lineHeight: 24, textAlign: 'center' },
});
