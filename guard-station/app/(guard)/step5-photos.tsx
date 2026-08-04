import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Image, ActivityIndicator, Alert, StyleSheet, ScrollView, Switch,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import { Camera, CheckCircle2, RefreshCw, UserCheck } from 'lucide-react-native';
import { useEntryStore } from '@/stores/entryStore';
import { uploadGatePhoto } from '@/services/gateService';
import { StepProgressBar } from '@/components/StepProgressBar';
import { OfflineBanner } from '@/components/OfflineBanner';
import { StepBackButton } from '@/components/StepBackButton';
import { stepLabelsFor, routeForDisplayStep } from '@/constants/steps';
import { COLORS } from '@/constants/theme';

type Slot = { uri: string; r2Key: string } | null;

// Already-uploaded photos (R2 keys, from a previous pass through this step)
// have no local file URI to re-display — only that the slot is done. A
// generic "uploaded" placeholder avoids re-uploading (and re-capturing) a
// photo that's already on the entry just because the guard tapped back.
const UPLOADED_SLOT_URI = 'uploaded';

export default function Step5Photos() {
  const {
    visitor, requireIdPhoto, requireVehiclePhoto, tempId, purpose, photoKeys, setPhotoKeys,
  } = useEntryStore();
  const [slots, setSlots] = useState<[Slot, Slot]>([
    photoKeys.idPhotoR2Key ? { uri: UPLOADED_SLOT_URI, r2Key: photoKeys.idPhotoR2Key } : null,
    photoKeys.vehiclePhotoR2Key ? { uri: UPLOADED_SLOT_URI, r2Key: photoKeys.vehiclePhotoR2Key } : null,
  ]);
  const [uploading, setUploading] = useState<[boolean, boolean]>([false, false]);
  const [noVehicle, setNoVehicle] = useState(false);

  const isAccountHolder = visitor?.isAccountHolder ?? false;
  const steps = stepLabelsFor(purpose);
  const currentStep = purpose === 'sell' ? 5 : 4;

  const required: [boolean, boolean] = [requireIdPhoto, requireVehiclePhoto];
  const labels = ['ID Document', 'Vehicle'];

  function isExempt(idx: 0 | 1): boolean {
    if (isAccountHolder) return true;
    if (idx === 1 && noVehicle) return true;
    return false;
  }

  async function captureSlot(idx: 0 | 1) {
    // The permission request and camera launch used to sit outside any
    // try/catch — if either threw (a native module issue, a permission API
    // quirk on a specific Android build), it became an unhandled promise
    // rejection that's silently swallowed in a release build: no crash, no
    // alert, nothing visibly happens on tap. Wrapping the whole function
    // means any such failure now surfaces instead of failing invisibly.
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Camera access is required to take photos.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.9, base64: false });
      if (result.canceled || !result.assets[0]) return;

      const raw = result.assets[0];
      setUploading((prev) => { const n = [...prev] as [boolean, boolean]; n[idx] = true; return n; });
      try {
        const compressed = await ImageManipulator.manipulateAsync(
          raw.uri,
          [{ resize: { width: 1280 } }],
          { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG }
        );
        const r2Key = await uploadGatePhoto(tempId, idx, compressed.uri);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setSlots((prev) => { const n = [...prev] as [Slot, Slot]; n[idx] = { uri: compressed.uri, r2Key }; return n; });
      } catch {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Upload failed', 'Could not upload photo. Check your connection and try again.');
      } finally {
        setUploading((prev) => { const n = [...prev] as [boolean, boolean]; n[idx] = false; return n; });
      }
    } catch (err) {
      Alert.alert('Camera error', err instanceof Error ? err.message : 'Could not open the camera.');
    }
  }

  const canContinue = ([0, 1] as const).every((i) => !required[i] || slots[i] !== null || isExempt(i));
  const anyUploading = uploading[0] || uploading[1];

  function handleNext() {
    if (!canContinue) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const notes: string[] = [];
    if (isAccountHolder) notes.push('Photos skipped — account holder');
    else if (noVehicle && required[1]) notes.push('No vehicle (walk-in)');

    setPhotoKeys(
      { idPhotoR2Key: slots[0]?.r2Key, vehiclePhotoR2Key: slots[1]?.r2Key },
      notes.length > 0 ? notes.join('\n') : undefined,
      noVehicle && required[1] ? true : undefined,
    );
    router.push('/(guard)/step6-review');
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
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.iconCircle}><Camera color={COLORS.blue} size={20} /></View>
            <Text style={styles.title}>Capture Photos</Text>
          </View>
          <Text style={styles.sub}>Required photos are marked with *</Text>
        </View>

        {isAccountHolder && (
          <View style={styles.accountBanner}>
            <UserCheck color="#059669" size={16} />
            <Text style={styles.accountBannerText}>Registered account holder — photo capture skipped</Text>
          </View>
        )}

        <View style={styles.slots}>
          {([0, 1] as const).map((idx) => {
            const exempt = isExempt(idx);
            return (
              <View key={idx} style={styles.slot}>
                <View style={styles.slotHeader}>
                  <Text style={styles.slotLabel}>
                    {labels[idx]}{required[idx] && !exempt ? ' *' : ''}
                  </Text>
                  {(slots[idx] || exempt) && <CheckCircle2 color={COLORS.green} size={16} />}
                </View>

                {exempt ? (
                  <View style={styles.exemptBox}>
                    <Text style={styles.exemptText}>Skipped</Text>
                  </View>
                ) : slots[idx]?.uri === UPLOADED_SLOT_URI ? (
                  <View style={[styles.exemptBox, { position: 'relative' }]}>
                    <CheckCircle2 color={COLORS.green} size={22} />
                    <Text style={styles.exemptText}>Already uploaded</Text>
                    <TouchableOpacity style={styles.retakeBtn} onPress={() => captureSlot(idx)}>
                      <RefreshCw color={COLORS.gray600} size={16} />
                    </TouchableOpacity>
                  </View>
                ) : slots[idx] ? (
                  <View style={{ position: 'relative' }}>
                    <Image source={{ uri: slots[idx]!.uri }} style={styles.photo} />
                    {uploading[idx] && (
                      <View style={styles.photoOverlay}>
                        <ActivityIndicator color={COLORS.white} />
                      </View>
                    )}
                    {!uploading[idx] && (
                      <TouchableOpacity style={styles.retakeBtn} onPress={() => captureSlot(idx)}>
                        <RefreshCw color={COLORS.gray600} size={16} />
                      </TouchableOpacity>
                    )}
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.captureBtn, uploading[idx] && styles.btnDisabled]}
                    onPress={() => captureSlot(idx)}
                    disabled={uploading[idx]}
                  >
                    {uploading[idx] ? (
                      <ActivityIndicator color={COLORS.gray400} />
                    ) : (
                      <>
                        <Camera color={COLORS.gray400} size={26} />
                        <Text style={styles.captureBtnText}>Tap to capture</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}

                {idx === 1 && !isAccountHolder && (
                  <View style={styles.noVehicleRow}>
                    <Switch value={noVehicle} onValueChange={setNoVehicle} trackColor={{ true: COLORS.blue }} />
                    <Text style={styles.noVehicleLabel}>No vehicle — walked in</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.nextBtn, (!canContinue || anyUploading) && styles.btnDisabled]}
            onPress={handleNext}
            disabled={!canContinue || anyUploading}
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
  accountBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#ECFDF5',
    borderRadius: 10, padding: 12, marginHorizontal: 20, marginTop: 16, borderWidth: 1, borderColor: '#A7F3D0',
  },
  accountBannerText: { color: '#047857', fontSize: 13, fontWeight: '600', flex: 1 },
  slots: { padding: 20, gap: 16, flexDirection: 'row', flexWrap: 'wrap' },
  slot: { flex: 1, minWidth: 150, backgroundColor: COLORS.white, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: COLORS.gray200 },
  slotHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  slotLabel: { color: COLORS.navy, fontWeight: '700', fontSize: 13 },
  exemptBox: { height: 130, borderRadius: 10, backgroundColor: COLORS.gray50, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.gray200 },
  exemptText: { color: COLORS.gray400, fontSize: 11, fontWeight: '600' },
  captureBtn: {
    height: 130, borderRadius: 10, borderWidth: 2, borderStyle: 'dashed', borderColor: COLORS.gray300,
    alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  btnDisabled: { opacity: 0.5 },
  captureBtnText: { color: COLORS.gray500, fontSize: 11, fontWeight: '600' },
  photo: { width: '100%', height: 130, borderRadius: 10, resizeMode: 'cover' },
  photoOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  retakeBtn: {
    position: 'absolute', top: 6, right: 6, width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.95)', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 2,
  },
  noVehicleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  noVehicleLabel: { color: COLORS.gray600, fontSize: 12 },
  footer: { padding: 20 },
  nextBtn: { backgroundColor: COLORS.blue, borderRadius: 14, paddingVertical: 16, alignItems: 'center', minHeight: 54 },
  nextBtnText: { color: COLORS.white, fontSize: 17, fontWeight: '700' },
});
