import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useOrderStore } from '@/stores/orderStore';
import { StepProgressBar } from '@/components/StepProgressBar';
import { OfflineBanner } from '@/components/OfflineBanner';
import { COLORS } from '@/constants/theme';

const KEYS = ['1','2','3','4','5','6','7','8','9','.','0','⌫'];

export default function Step3Weight() {
  const [display, setDisplay] = useState('0');
  const { currentProduct, setWeight } = useOrderStore();

  function pressKey(k: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDisplay(prev => {
      if (k === '⌫') return prev.length > 1 ? prev.slice(0, -1) : '0';
      if (k === '.' && prev.includes('.')) return prev;
      const parts = prev.includes('.') ? prev.split('.') : null;
      if (parts && parts[1]?.length >= 3) return prev;
      if (prev === '0' && k !== '.') return k;
      return prev + k;
    });
  }

  function adjust(delta: number) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDisplay(prev => {
      const val = Math.max(0, parseFloat(prev) + delta);
      return parseFloat(val.toFixed(3)).toString();
    });
  }

  function handleNext() {
    const val = parseFloat(display);
    if (!val || val <= 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setWeight(val);
    router.push('/(operator)/step4-photos');
  }

  const valid = parseFloat(display) > 0;

  return (
    <SafeAreaView style={styles.safe}>
      <StepProgressBar currentStep={3} />
      <OfflineBanner />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Weight</Text>
        <Text style={styles.sub}>{currentProduct?.name ?? 'Product'}</Text>
      </View>

      <View style={styles.displayBox}>
        <Text style={styles.displayNum}>{display}</Text>
        <Text style={styles.displayUnit}>{currentProduct?.unit ?? 'kg'}</Text>
      </View>

      <View style={styles.adjustRow}>
        {[-1, -0.1, +0.1, +1].map(d => (
          <TouchableOpacity key={d} style={styles.adjustBtn} onPress={() => adjust(d)}>
            <Text style={styles.adjustText}>{d > 0 ? `+${d}` : d}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.numpad}>
        {KEYS.map(k => (
          <TouchableOpacity key={k} style={styles.numKey} onPress={() => pressKey(k)} activeOpacity={0.7}>
            <Text style={styles.numKeyText}>{k}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.nextBtn, !valid && styles.btnDisabled]}
          onPress={handleNext}
          disabled={!valid}
        >
          <Text style={styles.nextBtnText}>Next → Photos</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.offWhite },
  header: { padding: 20, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  back: { color: COLORS.blue, fontSize: 15, marginBottom: 10 },
  title: { color: COLORS.navy, fontSize: 22, fontWeight: '800', marginBottom: 2 },
  sub: { color: COLORS.gray500, fontSize: 14 },
  displayBox: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center',
    paddingVertical: 24, backgroundColor: COLORS.white, marginHorizontal: 20,
    marginTop: 16, borderRadius: 16, gap: 8,
  },
  displayNum: { color: COLORS.navy, fontSize: 52, fontWeight: '800' },
  displayUnit: { color: COLORS.gray500, fontSize: 22, marginBottom: 8 },
  adjustRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, margin: 12 },
  adjustBtn: {
    backgroundColor: COLORS.white, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10,
    borderWidth: 1, borderColor: COLORS.gray200, minWidth: 64, alignItems: 'center',
  },
  adjustText: { color: COLORS.navy, fontWeight: '700', fontSize: 15 },
  numpad: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20, gap: 10, justifyContent: 'center', flex: 1 },
  numKey: {
    width: '29%', aspectRatio: 1.8, backgroundColor: COLORS.white, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.gray200,
  },
  numKeyText: { color: COLORS.navy, fontSize: 22, fontWeight: '600' },
  footer: { padding: 20 },
  nextBtn: { backgroundColor: COLORS.green, borderRadius: 14, paddingVertical: 16, alignItems: 'center', minHeight: 54 },
  btnDisabled: { opacity: 0.4 },
  nextBtnText: { color: COLORS.white, fontSize: 17, fontWeight: '700' },
});
