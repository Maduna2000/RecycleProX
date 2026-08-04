import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Truck } from 'lucide-react-native';
import { useEntryStore } from '@/stores/entryStore';
import { StepProgressBar } from '@/components/StepProgressBar';
import { OfflineBanner } from '@/components/OfflineBanner';
import { StepBackButton } from '@/components/StepBackButton';
import { stepLabelsFor, routeForDisplayStep } from '@/constants/steps';
import { COLORS } from '@/constants/theme';

export default function Step4Vehicle() {
  const { purpose, vehicleReg: savedReg, setVehicleReg } = useEntryStore();
  const [reg, setReg] = useState(savedReg);
  const steps = stepLabelsFor(purpose);
  const currentStep = purpose === 'sell' ? 4 : 3;

  function handleNext() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setVehicleReg(reg.trim());
    router.push('/(guard)/step5-photos');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StepProgressBar
        currentStep={currentStep}
        steps={steps}
        onStepPress={(step) => router.dismissTo(routeForDisplayStep(step, purpose))}
      />
      <OfflineBanner />
      <StepBackButton />
      <View style={styles.body}>
        <View style={styles.iconCircle}>
          <Truck color={COLORS.blue} size={32} />
        </View>
        <Text style={styles.title}>Vehicle Registration</Text>
        <Text style={styles.sub}>Enter the vehicle&apos;s number plate, if applicable</Text>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            value={reg}
            onChangeText={(t) => setReg(t.toUpperCase())}
            placeholder="SD 123 AB"
            placeholderTextColor={COLORS.gray400}
            autoCapitalize="characters"
            autoFocus
          />
          <TouchableOpacity style={styles.nextBtn} onPress={handleNext}>
            <Text style={styles.nextBtnText}>Continue →</Text>
          </TouchableOpacity>
          {!reg.trim() && <Text style={styles.hint}>No vehicle? Leave blank and continue.</Text>}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.offWhite },
  body: { flex: 1, alignItems: 'center', padding: 24, gap: 8 },
  iconCircle: { width: 72, height: 72, borderRadius: 20, backgroundColor: 'rgba(37,99,235,0.1)', alignItems: 'center', justifyContent: 'center', marginTop: 24, marginBottom: 8 },
  title: { color: COLORS.navy, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  sub: { color: COLORS.gray500, fontSize: 14, textAlign: 'center', marginBottom: 16 },
  form: { width: '100%', maxWidth: 400, gap: 14 },
  input: {
    backgroundColor: COLORS.white, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16,
    color: COLORS.gray800, fontSize: 20, fontWeight: '600', textAlign: 'center', letterSpacing: 1.5,
    borderWidth: 1, borderColor: COLORS.gray200,
  },
  nextBtn: { backgroundColor: COLORS.blue, borderRadius: 14, paddingVertical: 16, alignItems: 'center', minHeight: 54 },
  nextBtnText: { color: COLORS.white, fontSize: 17, fontWeight: '700' },
  hint: { color: COLORS.gray400, fontSize: 12, textAlign: 'center' },
});
