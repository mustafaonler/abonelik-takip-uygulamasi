import { Stack } from 'expo-router';
import { COLORS } from '../../lib/theme';

// Form kendi stack'inde açılır: sekme çubuğunun üstünü kaplar, geri tuşu
// navigasyondan gelir ve ekrandan çıkınca state sıfırlanır — sekme içindeyken
// bileşen mount'ta kaldığı için eski değerler geri geliyordu.
export default function AddLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.bg },
        headerTintColor: COLORS.text,
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: COLORS.bg },
      }}
    >
      <Stack.Screen name="form" options={{ title: 'Yeni Abonelik' }} />
    </Stack>
  );
}
