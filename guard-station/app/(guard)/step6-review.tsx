import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { ClipboardCheck, AlertCircle } from 'lucide-react-native';
import { useEntryStore } from '@/stores/entryStore';
import { createGateEntry, type Purpose } from '@/services/gateService';
import { StepProgressBar } from '@/components/StepProgressBar';
import { OfflineBanner } from '@/components/OfflineBanner';
import { COLORS } from '@/constants/theme';

const STEPS_SELL = ['Visitor', 'Purpose', 'Category', 'Vehicle', 'Photos', 'Review'];
const STEPS_OTHER = ['Visitor', 'Purpose', 'Vehicle', 'Photos', 'Review'];

const PURPOSE_LABELS: Record<Purpose, string> = {
  sell: 'To Sell', buy: 'To Buy', visitor: 'Visitor', other: 'Other',
};

export default function Step6Review() {
  const {
    visitor, purpose, categoryNames, vehicleReg, photoKeys,
    photoExemptionNote, vehicleExempt, setSubmitted,
  } = useEntryStore();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const steps = purpose === 'sell' ? STEPS_SELL : STEPS_OTHER;
  const currentStep = steps.length;

  async function handleSubmit() {
    if (!visitor || !purpose) return;
    setSubmitting(true);
    setError(null);
    try {
      const entry = await createGateEntry({
        purpose,
        categoryNames: categoryNames.length > 0 ? categoryNames : undefined,
        visitorFirstName: visitor.firstName,
        visitorLastName: visitor.lastName,
        visitorIdNumber: visitor.idNumber,
        visitorPhone: visitor.phone,
        vehicleReg: vehicleReg || undefined,
        notes: photoExemptionNote,
        vehicleExempt,
        ...photoKeys,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSubmitted(entry.entryNumber, entry.queueNumber ?? null);
      router.replace('/(guard)/success');
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const axiosErr = err as { response?: { status?: number; data?: { error?: string } } };
      setError(
        axiosErr?.response?.status === 401
          ? 'Session expired — sign out and back in to refresh it.'
          : (axiosErr?.response?.data?.error ?? 'Failed to register entry')
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!visitor || !purpose) return null;

  return (
    <SafeAreaView style={styles.safe}>
      <StepProgressBar currentStep={currentStep} steps={steps} />
      <OfflineBanner />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.iconCircle}><ClipboardCheck color={COLORS.blue} size={20} /></View>
            <Text style={styles.title}>Review</Text>
          </View>
          <Text style={styles.sub}>Confirm the details before registering</Text>
        </View>

        <View style={styles.body}>
          <View style={styles.card}>
            <Row label="Visitor" value={`${visitor.firstName} ${visitor.lastName}`} />
            <Row label="ID Number" value={visitor.idNumber} />
            {visitor.phone && <Row label="Phone" value={visitor.phone} />}
            <Row label="Purpose" value={PURPOSE_LABELS[purpose]} />
            {categoryNames.length > 0 && <Row label="Category" value={categoryNames.join(', ')} />}
            {vehicleReg && <Row label="Vehicle Reg" value={vehicleReg} />}
            {photoExemptionNote && <Row label="Note" value={photoExemptionNote} />}
          </View>

          {error && (
            <View style={styles.errorBox}>
              <AlertCircle color={COLORS.red} size={16} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.btnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.submitBtnText}>Register Entry</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.offWhite },
  header: { padding: 20, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  iconCircle: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(37,99,235,0.1)', alignItems: 'center', justifyContent: 'center' },
  title: { color: COLORS.navy, fontSize: 20, fontWeight: '800' },
  sub: { color: COLORS.gray500, fontSize: 14 },
  body: { flex: 1, padding: 20 },
  card: { backgroundColor: COLORS.white, borderRadius: 16, padding: 18 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  rowLabel: { color: COLORS.gray500, fontSize: 13 },
  rowValue: { color: COLORS.gray800, fontSize: 14, fontWeight: '700', textAlign: 'right', flexShrink: 1, marginLeft: 12 },
  errorBox: { flexDirection: 'row', gap: 8, backgroundColor: COLORS.redLight, borderRadius: 10, padding: 12, marginTop: 16, borderWidth: 1, borderColor: '#FECACA' },
  errorText: { color: '#B91C1C', fontSize: 13, fontWeight: '500', flex: 1 },
  footer: { padding: 20 },
  submitBtn: { backgroundColor: COLORS.blue, borderRadius: 14, paddingVertical: 16, alignItems: 'center', minHeight: 54 },
  btnDisabled: { opacity: 0.6 },
  submitBtnText: { color: COLORS.white, fontSize: 17, fontWeight: '700' },
});
