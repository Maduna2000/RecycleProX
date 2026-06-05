import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useOrderStore } from '@/stores/orderStore';
import { StepProgressBar } from '@/components/StepProgressBar';
import { OfflineBanner } from '@/components/OfflineBanner';
import { COLORS } from '@/constants/theme';

export default function Step5Confirm() {
  const { currentProduct, currentWeight, lines, confirmLine } = useOrderStore();

  function handleAddAnother() {
    confirmLine();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/(operator)/step2-product');
  }

  function handleReview() {
    confirmLine();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    router.push('/(operator)/step6-review');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StepProgressBar currentStep={5} />
      <OfflineBanner />

      <View style={styles.header}>
        <Text style={styles.title}>Confirm Line</Text>
        <Text style={styles.sub}>Review this entry before adding more</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Product</Text>
          <Text style={styles.cardValue}>{currentProduct?.name}</Text>
          <View style={styles.divider} />
          <Text style={styles.cardLabel}>Weight</Text>
          <Text style={styles.cardValueLarge}>
            {currentWeight} <Text style={styles.unit}>{currentProduct?.unit ?? 'kg'}</Text>
          </Text>
        </View>

        {lines.length > 0 && (
          <View style={styles.existing}>
            <Text style={styles.existingTitle}>{lines.length} line{lines.length > 1 ? 's' : ''} already added</Text>
            {lines.map((l, i) => (
              <View key={i} style={styles.existingRow}>
                <Text style={styles.existingName}>{l.product.name}</Text>
                <Text style={styles.existingWeight}>{l.weight} {l.product.unit}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.secondaryBtn} onPress={handleAddAnother} activeOpacity={0.85}>
          <Text style={styles.secondaryBtnText}>+ Add Another Product</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.primaryBtn} onPress={handleReview} activeOpacity={0.85}>
          <Text style={styles.primaryBtnText}>Review Order →</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.offWhite },
  header: { padding: 20, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  title: { color: COLORS.navy, fontSize: 22, fontWeight: '800', marginBottom: 2 },
  sub: { color: COLORS.gray500, fontSize: 14 },
  body: { flex: 1, padding: 20, gap: 16 },
  card: { backgroundColor: COLORS.white, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: COLORS.gray200 },
  cardLabel: { color: COLORS.gray500, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  cardValue: { color: COLORS.gray800, fontSize: 18, fontWeight: '700', marginTop: 4 },
  cardValueLarge: { color: COLORS.navy, fontSize: 36, fontWeight: '800', marginTop: 4 },
  unit: { fontSize: 18, color: COLORS.gray500 },
  divider: { height: 1, backgroundColor: COLORS.gray100, marginVertical: 16 },
  existing: { backgroundColor: COLORS.white, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: COLORS.gray200 },
  existingTitle: { color: COLORS.gray500, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 10 },
  existingRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  existingName: { color: COLORS.gray700, fontSize: 14, fontWeight: '600' },
  existingWeight: { color: COLORS.navy, fontSize: 14, fontWeight: '700' },
  footer: { padding: 20, gap: 12 },
  secondaryBtn: {
    backgroundColor: COLORS.white, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', minHeight: 54, borderWidth: 1, borderColor: COLORS.gray300,
  },
  secondaryBtnText: { color: COLORS.navy, fontSize: 17, fontWeight: '700' },
  primaryBtn: { backgroundColor: COLORS.green, borderRadius: 14, paddingVertical: 16, alignItems: 'center', minHeight: 54 },
  primaryBtnText: { color: COLORS.white, fontSize: 17, fontWeight: '700' },
});
