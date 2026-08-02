import { Tabs, router } from 'expo-router';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { supabase } from '../../lib/supabase';

export default function TabsLayout() {
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/(auth)/login');
  };

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#0d0d1a' },
        headerTintColor: '#f1f5f9',
        tabBarStyle: {
          backgroundColor: '#0d0d1a',
          borderTopColor: 'rgba(255,255,255,0.08)',
        },
        tabBarActiveTintColor: '#a78bfa',
        tabBarInactiveTintColor: '#475569',
        headerRight: () => (
          <TouchableOpacity onPress={handleSignOut} style={styles.signOut}>
            <Text style={styles.signOutText}>Çıkış</Text>
          </TouchableOpacity>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Aboneliklerim', tabBarLabel: 'Ana Sayfa' }}
      />
      <Tabs.Screen
        name="add"
        options={{ title: 'Yeni Ekle', tabBarLabel: 'Ekle' }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  signOut: { marginRight: 16 },
  signOutText: { color: '#a78bfa', fontWeight: '600', fontSize: 14 },
});
