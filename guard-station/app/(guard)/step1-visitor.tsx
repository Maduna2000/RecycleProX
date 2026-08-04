import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { IdCard, CheckCircle2, AlertCircle, History } from 'lucide-react-native';
import { useEntryStore } from '@/stores/entryStore';
import { lookupCustomer, getRepeatVisitInfo, type RepeatVisitInfo } from '@/services/gateService';
import { StepProgressBar } from '@/components/StepProgressBar';
import { OfflineBanner } from '@/components/OfflineBanner';
import { stepLabelsFor } from '@/constants/steps';
import { COLORS } from '@/constants/theme';

const STEPS = stepLabelsFor(null);

export default function Step1Visitor() {
  const { setVisitor } = useEntryStore();
  const [idNumber, setIdNumber] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [matched, setMatched] = useState<{ firstName: string; lastName: string } | null>(null);
  const [isAccountHolder, setIsAccountHolder] = useState(false);
  const [blacklistError, setBlacklistError] = useState<string | null>(null);
  const [repeatInfo, setRepeatInfo] = useState<RepeatVisitInfo | null>(null);
  const lastLookedUp = useRef('');

  async function handleIdBlur() {
    const trimmed = idNumber.trim();
    if (trimmed.length < 4 || trimmed === lastLookedUp.current) return;
    lastLookedUp.current = trimmed;

    setLookingUp(true);
    setBlacklistError(null);
    setMatched(null);
    setIsAccountHolder(false);
    setRepeatInfo(null);

    try {
      const [customer, repeat] = await Promise.all([
        lookupCustomer(trimmed).catch(() => null),
        getRepeatVisitInfo(trimmed).catch(() => null),
      ]);

      if (customer) {
        if (customer.blacklisted) {
          setBlacklistError(`This visitor is blacklisted: ${customer.blacklistReason || 'No reason provided'} — entry cannot be registered.`);
        } else {
          setFirstName(customer.firstName);
          setLastName(customer.lastName);
          setPhone(customer.phone ?? '');
          setMatched({ firstName: customer.firstName, lastName: customer.lastName });
          setIsAccountHolder(customer.customerType === 'account');
        }
      }
      if (repeat && repeat.count > 0) setRepeatInfo(repeat);
    } finally {
      setLookingUp(false);
    }
  }

  function handleNext() {
    if (blacklistError || !idNumber.trim() || !firstName.trim() || !lastName.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setVisitor({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      idNumber: idNumber.trim(),
      phone: phone.trim() || undefined,
      isAccountHolder,
    });
    router.push('/(guard)/step2-purpose');
  }

  const canContinue = !blacklistError && !!idNumber.trim() && !!firstName.trim() && !!lastName.trim();

  return (
    <SafeAreaView style={styles.safe}>
      <StepProgressBar currentStep={1} steps={STEPS} />
      <OfflineBanner />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.iconCircle}><IdCard color={COLORS.blue} size={20} /></View>
            <Text style={styles.title}>Who&apos;s entering?</Text>
          </View>
          <Text style={styles.sub}>Enter the visitor&apos;s National ID / Passport number</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>National ID / Passport *</Text>
          <View>
            <TextInput
              style={styles.input}
              value={idNumber}
              onChangeText={setIdNumber}
              onBlur={handleIdBlur}
              placeholder="e.g. 9001015800086"
              placeholderTextColor={COLORS.gray400}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {lookingUp && <ActivityIndicator style={styles.inputSpinner} color={COLORS.gray400} size="small" />}
          </View>

          {matched && (
            <View style={styles.matchedBox}>
              <CheckCircle2 color="#047857" size={14} />
              <Text style={styles.matchedText}>
                Registered customer: {matched.firstName} {matched.lastName}
                {isAccountHolder && ' — photo capture will be skipped'}
              </Text>
            </View>
          )}

          {blacklistError && (
            <View style={styles.errorBox}>
              <AlertCircle color={COLORS.red} size={16} style={{ marginTop: 1 }} />
              <Text style={styles.errorText}>{blacklistError}</Text>
            </View>
          )}

          {repeatInfo && !blacklistError && (
            <View style={styles.infoBox}>
              <History color={COLORS.blue} size={16} />
              <Text style={styles.infoText}>
                Visited {repeatInfo.count} time{repeatInfo.count !== 1 ? 's' : ''} before
                {repeatInfo.lastVisitAt ? `, last on ${new Date(repeatInfo.lastVisitAt).toLocaleDateString()}` : ''}
              </Text>
            </View>
          )}

          <Text style={styles.label}>First Name *</Text>
          <TextInput style={styles.input} value={firstName} onChangeText={setFirstName}
            placeholder="John" placeholderTextColor={COLORS.gray400} autoCapitalize="words" />

          <Text style={styles.label}>Last Name *</Text>
          <TextInput style={styles.input} value={lastName} onChangeText={setLastName}
            placeholder="Smith" placeholderTextColor={COLORS.gray400} autoCapitalize="words" />

          <Text style={styles.label}>Phone Number</Text>
          <TextInput style={styles.input} value={phone} onChangeText={setPhone}
            placeholder="76123456" placeholderTextColor={COLORS.gray400} keyboardType="phone-pad" />
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.nextBtn, !canContinue && styles.btnDisabled]}
            onPress={handleNext}
            disabled={!canContinue}
          >
            <Text style={styles.nextBtnText}>Continue →</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.offWhite },
  header: { padding: 20, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  iconCircle: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(37,99,235,0.1)', alignItems: 'center', justifyContent: 'center' },
  title: { color: COLORS.navy, fontSize: 20, fontWeight: '800' },
  sub: { color: COLORS.gray500, fontSize: 14 },
  form: { flex: 1, paddingHorizontal: 20 },
  label: { color: COLORS.gray600, fontSize: 13, fontWeight: '600', marginBottom: 4, marginTop: 14 },
  input: {
    backgroundColor: COLORS.white, borderRadius: 10, padding: 14,
    color: COLORS.gray800, fontSize: 16, borderWidth: 1, borderColor: COLORS.gray200,
  },
  inputSpinner: { position: 'absolute', right: 14, top: 14 },
  matchedBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ECFDF5',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginTop: 8, alignSelf: 'flex-start',
  },
  matchedText: { color: '#047857', fontSize: 12, fontWeight: '600', flexShrink: 1 },
  errorBox: {
    flexDirection: 'row', gap: 8, backgroundColor: COLORS.redLight,
    borderRadius: 10, padding: 12, marginTop: 10, borderWidth: 1, borderColor: '#FECACA',
  },
  errorText: { color: '#B91C1C', fontSize: 13, fontWeight: '500', flex: 1 },
  infoBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#EFF6FF',
    borderRadius: 10, padding: 12, marginTop: 10, borderWidth: 1, borderColor: '#BFDBFE',
  },
  infoText: { color: '#1D4ED8', fontSize: 13, flex: 1 },
  footer: { padding: 20 },
  nextBtn: { backgroundColor: COLORS.blue, borderRadius: 14, paddingVertical: 16, alignItems: 'center', minHeight: 54 },
  btnDisabled: { opacity: 0.4 },
  nextBtnText: { color: COLORS.white, fontSize: 17, fontWeight: '700' },
});
