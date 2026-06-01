import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useOrderStore } from '@/stores/orderStore';
import { StepProgressBar } from '@/components/StepProgressBar';
import { OfflineBanner } from '@/components/OfflineBanner';
import { COLORS, MIN_TOUCH_TARGET } from '@/constants/theme';

const NUMPAD_KEYS = ['1','2','3','4','5','6','7','8','9','.','0','⌫'];

export default function Step3Weight() {
  const [input, setInput] = useState('0');
  const { currentProduct, setWeight } = useOrderStore();

  const handleKey = (key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (key === '⌫') {
      setInput((v) => (v.length > 1 ? v.slice(0, -1) : '0'));
      return;
    }
    if (key === '.' && input.includes('.')) return;
    if (input === '0' && key !== '.') {
      setInput(key);
    } else {
      const next = input + key;
      // Max 2 decimal places
      const parts = next.split('.');
      if (parts[1] && parts[1].length > 3) return;
      setInput(next);
    }
  };

  const adjust = (delta: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const val = parseFloat(input) || 0;
    const next = Math.max(0, val + delta);
    setInput(next.toFixed(3).replace(/\.?0+$/, '') || '0');
  };

  const weight = parseFloat(input) || 0;
  const canProceed = weight > 0;

  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setWeight(weight);
    router.push('/(operator)/step4-photos');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.navy }}>
      <StepProgressBar currentStep={3} />
      <OfflineBanner />

      {/* Product header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15 }}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 8 }}>Product</Text>
        <Text style={{ color: COLORS.white, fontSize: 18, fontWeight: '700' }}>
          {currentProduct?.name ?? '—'}
        </Text>
      </View>

      {/* Weight display */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
          <Text
            style={{
              color: canProceed ? COLORS.green : 'rgba(255,255,255,0.4)',
              fontSize: 72,
              fontWeight: '800',
              fontVariant: ['tabular-nums'],
            }}
          >
            {input}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 24, marginBottom: 14 }}>
            {currentProduct?.unit ?? 'kg'}
          </Text>
        </View>

        {/* Quick adjust */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {[-1, -0.1, +0.1, +1].map((delta) => (
            <TouchableOpacity
              key={delta}
              onPress={() => adjust(delta)}
              style={{
                backgroundColor: 'rgba(255,255,255,0.1)',
                borderRadius: 10,
                paddingHorizontal: 14,
                paddingVertical: 10,
                minHeight: MIN_TOUCH_TARGET,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Text style={{ color: COLORS.white, fontSize: 14, fontWeight: '600' }}>
                {delta > 0 ? `+${delta}` : delta}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Numpad */}
      <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {NUMPAD_KEYS.map((key) => (
            <TouchableOpacity
              key={key}
              onPress={() => handleKey(key)}
              style={{
                width: '30%',
                minHeight: 64,
                backgroundColor: key === '⌫' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.1)',
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 1,
              }}
              activeOpacity={0.7}
            >
              <Text style={{ color: COLORS.white, fontSize: 24, fontWeight: '600' }}>{key}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          onPress={handleNext}
          disabled={!canProceed}
          style={{
            marginTop: 14,
            backgroundColor: canProceed ? COLORS.green : 'rgba(255,255,255,0.15)',
            borderRadius: 14,
            paddingVertical: 16,
            alignItems: 'center',
            minHeight: 54,
          }}
          activeOpacity={0.85}
        >
          <Text style={{ color: COLORS.white, fontSize: 17, fontWeight: '700' }}>
            Confirm Weight →
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
