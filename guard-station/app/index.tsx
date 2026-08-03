import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { COLORS } from '@/constants/theme';

export default function Index() {
  const { restoreSession } = useAuthStore();

  useEffect(() => {
    async function bootstrap() {
      try {
        const ok = await restoreSession();
        if (ok) {
          router.replace('/(guard)');
        } else {
          router.replace('/(auth)/login');
        }
      } catch {
        router.replace('/(auth)/login');
      }
    }
    bootstrap();
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={COLORS.blue} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
