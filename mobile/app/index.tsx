import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '@/stores/authStore';
import { COLORS } from '@/constants/theme';

export default function Index() {
  const { restoreSession } = useAuthStore();

  useEffect(() => {
    async function bootstrap() {
      try {
        const onboardingDone = await AsyncStorage.getItem('onboarding_complete');
        if (!onboardingDone) {
          router.replace('/(onboarding)');
          return;
        }
        const ok = await restoreSession();
        if (ok) {
          router.replace('/(operator)');
        } else {
          router.replace('/(auth)/login');
        }
      } catch {
        router.replace('/(auth)/login');
      }
    }
    bootstrap().catch(() => {
      router.replace('/(auth)/login');
    });
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={COLORS.green} />
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
