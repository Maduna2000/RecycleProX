import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, BackHandler } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { LogIn, LogOut } from 'lucide-react-native';
import { useAuthStore } from '@/stores/authStore';
import { useEntryStore } from '@/stores/entryStore';
import { COLORS } from '@/constants/theme';

// Kiosk tablet — this is the root of the guard flow, so the hardware back
// button here must not exit to the Android launcher (a guard walking away
// with the app backgrounded is exactly the failure mode kiosk mode exists
// to prevent). Back navigation *within* the entry steps (step1..6) is
// untouched — expo-router's Stack still pops those normally since this
// listener only exists on this screen.
function useBlockExitBack() {
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);
}

export default function GuardHome() {
  useBlockExitBack();
  const { user, logout } = useAuthStore();
  const { reset } = useEntryStore();

  function handleNewEntry() {
    reset();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/(guard)/step1-visitor');
  }

  function handleCheckOut() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/(guard)/checkout');
  }

  async function handleLogout() {
    await logout();
    router.replace('/(auth)/login');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello,</Text>
          <Text style={styles.name}>{user?.fullName ?? user?.username ?? 'Guard'}</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn} activeOpacity={0.7}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <TouchableOpacity style={styles.card} onPress={handleNewEntry} activeOpacity={0.85}>
          <View style={[styles.iconCircle, { backgroundColor: 'rgba(37,99,235,0.12)' }]}>
            <LogIn color={COLORS.blue} size={26} />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>New Entry</Text>
            <Text style={styles.cardSub}>Register a visitor, vehicle or delivery entering the yard.</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} onPress={handleCheckOut} activeOpacity={0.85}>
          <View style={[styles.iconCircle, { backgroundColor: 'rgba(15,32,58,0.08)' }]}>
            <LogOut color={COLORS.navy} size={26} />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Check Out</Text>
            <Text style={styles.cardSub}>Find someone currently on site and log their exit.</Text>
          </View>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.offWhite },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: COLORS.navy, paddingHorizontal: 20, paddingVertical: 16,
  },
  greeting: { color: 'rgba(255,255,255,0.6)', fontSize: 13 },
  name: { color: COLORS.white, fontSize: 18, fontWeight: '800' },
  logoutBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  logoutText: { color: 'rgba(255,255,255,0.7)', fontSize: 14 },
  body: { flex: 1, padding: 20, justifyContent: 'center', gap: 16 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: COLORS.white, borderRadius: 16, padding: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
    minHeight: 88,
  },
  iconCircle: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  cardText: { flex: 1 },
  cardTitle: { color: COLORS.navy, fontSize: 19, fontWeight: '800', marginBottom: 4 },
  cardSub: { color: COLORS.gray500, fontSize: 13, lineHeight: 18 },
});
