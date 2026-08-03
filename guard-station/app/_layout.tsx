import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import { activateKeepAwakeAsync } from 'expo-keep-awake';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// Kiosk setup — the tablet stays on-screen and full-screen for the whole
// shift. Uses the official Expo modules (expo-status-bar's declarative
// hidden prop + expo-navigation-bar's imperative API) rather than raw
// native systemUiVisibility flags — this is a true native app, not a
// WebView, so there's no risk of the viewport-desync bug that broke the
// earlier Capacitor attempt's immersive mode, but these are still the
// safer, officially-supported APIs to reach for first.
function useKioskMode() {
  useEffect(() => {
    activateKeepAwakeAsync().catch(() => {});
    NavigationBar.setVisibilityAsync('hidden').catch(() => {});
    NavigationBar.setBehaviorAsync('overlay-swipe').catch(() => {});
  }, []);
}

export default function RootLayout() {
  useKioskMode();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <StatusBar hidden />
          <Stack screenOptions={{ headerShown: false }} />
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
