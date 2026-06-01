import React, { useRef } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import * as Haptics from 'expo-haptics';
import { useOrderStore } from '@/stores/orderStore';
import { StepProgressBar } from '@/components/StepProgressBar';
import { OfflineBanner } from '@/components/OfflineBanner';
import { COLORS } from '@/constants/theme';

export default function Step5Confirm() {
  const { currentProduct, currentWeight, lines, confirmLine, addAnotherLine } = useOrderStore();
  const sheetRef = useRef<BottomSheet>(null);

  const handleConfirmLine = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    confirmLine();
  };

  const handleAddAnother = () => {
    Haptics.selectionAsync();
    addAnotherLine();
    router.push('/(operator)/step2-product');
  };

  const handleReview = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/(operator)/step6-review');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.offWhite }}>
      <StepProgressBar currentStep={5} />
      <OfflineBanner />

      <View style={{ flex: 1, padding: 20 }}>
        <Text style={{ color: COLORS.navy, fontSize: 22, fontWeight: '800', marginBottom: 24 }}>
          Line Added ✓
        </Text>

        {/* Current line card */}
        <View
          style={{
            backgroundColor: COLORS.white,
            borderRadius: 16,
            padding: 20,
            borderLeftWidth: 4,
            borderLeftColor: COLORS.green,
            gap: 12,
            marginBottom: 24,
          }}
        >
          <Text style={{ color: COLORS.gray500, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>
            Just Added
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: COLORS.gray800, fontSize: 17, fontWeight: '700', flex: 1 }}>
              {currentProduct?.name}
            </Text>
            <View style={{ backgroundColor: COLORS.green + '20', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}>
              <Text style={{ color: COLORS.green, fontWeight: '800', fontSize: 16 }}>
                {currentWeight} {currentProduct?.unit}
              </Text>
            </View>
          </View>
          <Text style={{ color: COLORS.gray500, fontSize: 13 }}>📷 2 photos attached</Text>
        </View>

        {/* Previous lines (if any confirmed) */}
        {lines.length > 0 && (
          <View>
            <Text style={{ color: COLORS.gray500, fontSize: 13, fontWeight: '600', marginBottom: 10 }}>
              {lines.length} previous line{lines.length > 1 ? 's' : ''} in this order
            </Text>
            {lines.map((line, i) => (
              <View
                key={i}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  paddingVertical: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: COLORS.gray100,
                }}
              >
                <Text style={{ color: COLORS.gray700, fontSize: 14 }}>{line.product.name}</Text>
                <Text style={{ color: COLORS.gray600, fontSize: 14, fontWeight: '600' }}>
                  {line.weight} {line.product.unit}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Bottom CTAs */}
      <View style={{ paddingHorizontal: 20, paddingBottom: 24, gap: 12 }}>
        <TouchableOpacity
          onPress={() => { handleConfirmLine(); handleAddAnother(); }}
          style={{
            backgroundColor: COLORS.white,
            borderRadius: 14,
            paddingVertical: 16,
            alignItems: 'center',
            borderWidth: 2,
            borderColor: COLORS.navy,
            minHeight: 54,
          }}
          activeOpacity={0.85}
        >
          <Text style={{ color: COLORS.navy, fontSize: 17, fontWeight: '700' }}>+ Add Another Product</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => { handleConfirmLine(); handleReview(); }}
          style={{
            backgroundColor: COLORS.green,
            borderRadius: 14,
            paddingVertical: 16,
            alignItems: 'center',
            minHeight: 54,
          }}
          activeOpacity={0.85}
        >
          <Text style={{ color: COLORS.white, fontSize: 17, fontWeight: '700' }}>Review Order →</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
