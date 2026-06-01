import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
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
        const hasSession = await restoreSession();
        if (hasSession) {
          router.replace('/(operator)');
        } else {
          router.replace('/(auth)/login');
        }
      } catch {
        router.replace('/(auth)/login');
      } finally {
        SplashScreen.hideAsync();
      }
    }
    bootstrap();
  }, [restoreSession]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.navy, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={COLORS.green} size="large" />
    </View>
  );
}
