import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useEntryStore } from '@/stores/entryStore';
import { COLORS } from '@/constants/theme';

export default function SuccessScreen() {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const { submittedEntryNumber, submittedQueueNumber, reset } = useEntryStore();

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.sequence([
      Animated.delay(100),
      Animated.spring(scale, { toValue: 1, damping: 12, stiffness: 150, useNativeDriver: true }),
    ]).start();
    Animated.sequence([
      Animated.delay(200),
      Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  function handleNewEntry() {
    reset();
    router.replace('/(guard)');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.body}>
        <Animated.View style={[styles.checkCircle, { transform: [{ scale }] }]}>
          <Text style={styles.checkmark}>✓</Text>
        </Animated.View>

        <Animated.View style={[styles.info, { opacity }]}>
          <Text style={styles.heading}>Entry Registered</Text>
          {submittedQueueNumber !== null && (
            <View style={styles.queueBox}>
              <Text style={styles.queueLabel}>Queue Number</Text>
              <Text style={styles.queueNum}>{submittedQueueNumber}</Text>
            </View>
          )}
          {submittedEntryNumber ? (
            <Text style={styles.entryNumber}>{submittedEntryNumber}</Text>
          ) : null}
        </Animated.View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.newEntryBtn} onPress={handleNewEntry} activeOpacity={0.85}>
          <Text style={styles.newEntryBtnText}>+ New Entry</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.navy },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 24 },
  checkCircle: {
    width: 100, height: 100, borderRadius: 50, backgroundColor: COLORS.green,
    alignItems: 'center', justifyContent: 'center',
  },
  checkmark: { color: COLORS.white, fontSize: 52, fontWeight: '800' },
  info: { alignItems: 'center', gap: 10 },
  heading: { color: COLORS.white, fontSize: 28, fontWeight: '800' },
  queueBox: { alignItems: 'center', gap: 2 },
  queueLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  queueNum: { color: COLORS.blueLight, fontSize: 56, fontWeight: '800' },
  entryNumber: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontFamily: 'monospace' },
  actions: { paddingHorizontal: 32, paddingBottom: 32 },
  newEntryBtn: {
    backgroundColor: COLORS.blue, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', minHeight: 54,
  },
  newEntryBtnText: { color: COLORS.white, fontSize: 17, fontWeight: '700' },
});
