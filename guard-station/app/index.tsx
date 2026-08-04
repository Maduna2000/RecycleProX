import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { useEntryStore } from '@/stores/entryStore';
import { INTERNAL_STEP_ROUTES } from '@/constants/steps';
import { COLORS } from '@/constants/theme';

// entryStore's persist middleware rehydrates from AsyncStorage
// asynchronously — reading its state before that finishes would see the
// pre-rehydration defaults (step 1, no visitor) even when a real
// in-progress entry is sitting in storage.
function waitForEntryHydration(): Promise<void> {
  if (useEntryStore.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = useEntryStore.persist.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
}

export default function Index() {
  const { restoreSession } = useAuthStore();

  useEffect(() => {
    async function bootstrap() {
      try {
        const ok = await restoreSession();
        if (!ok) {
          router.replace('/(auth)/login');
          return;
        }

        // A tablet's process can be killed mid-entry (backgrounded app,
        // memory pressure) at any time — that's normal Android behavior,
        // not a network problem, but it looks identical to one from the
        // guard's seat: the app reopens and everything they'd already
        // entered/captured seems gone. It isn't — entryStore persists it —
        // but landing back on the Home screen hid that, and Home's "New
        // Entry" card unconditionally calls reset(), which really would
        // discard it. Routing straight back into the in-progress step
        // instead means a relaunch (for any reason, including a network
        // drop that happened to coincide with one) never loses a
        // half-completed entry.
        await waitForEntryHydration();
        const wip = useEntryStore.getState();
        if (wip.visitor && !wip.submittedEntryNumber) {
          router.replace(INTERNAL_STEP_ROUTES[wip.step]);
        } else {
          router.replace('/(guard)');
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
