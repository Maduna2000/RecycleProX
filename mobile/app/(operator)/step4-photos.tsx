import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Image, ActivityIndicator, Alert, StyleSheet, ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import { useOrderStore } from '@/stores/orderStore';
import { getPresignedUploadUrl, uploadToR2 } from '@/services/scaleService';
import { StepProgressBar } from '@/components/StepProgressBar';
import { OfflineBanner } from '@/components/OfflineBanner';
import { COLORS } from '@/constants/theme';

type Slot = { uri: string; r2Key: string } | null;

export default function Step4Photos() {
  const [slots, setSlots] = useState<[Slot, Slot]>([null, null]);
  const [uploading, setUploading] = useState<[boolean, boolean]>([false, false]);
  const { currentProduct, addPhoto, goToStep } = useOrderStore();

  async function captureSlot(idx: 0 | 1) {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Camera access is required to take photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.9, base64: false });
    if (result.canceled || !result.assets[0]) return;

    const raw = result.assets[0];
    setUploading(prev => { const n = [...prev] as [boolean,boolean]; n[idx] = true; return n; });
    try {
      const compressed = await ImageManipulator.manipulateAsync(
        raw.uri,
        [{ resize: { width: 1280 } }],
        { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG }
      );
      const filename = `scale_${Date.now()}_${idx}.jpg`;
      const { uploadUrl, r2Key } = await getPresignedUploadUrl(filename, 'image/jpeg');
      await uploadToR2(uploadUrl, compressed.uri, 'image/jpeg');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSlots(prev => { const n = [...prev] as [Slot,Slot]; n[idx] = { uri: compressed.uri, r2Key }; return n; });
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Upload failed', 'Could not upload photo. Check your connection and try again.');
    } finally {
      setUploading(prev => { const n = [...prev] as [boolean,boolean]; n[idx] = false; return n; });
    }
  }

  function handleNext() {
    if (!slots[0] || !slots[1]) return;
    addPhoto(slots[0].uri, slots[0].r2Key);
    addPhoto(slots[1].uri, slots[1].r2Key);
    goToStep(5);
    router.push('/(operator)/step5-confirm');
  }

  const LABELS = ['Scale Reading', 'Product / Load'];
  const bothDone = slots[0] !== null && slots[1] !== null;
  const anyUploading = uploading[0] || uploading[1];

  return (
    <SafeAreaView style={styles.safe}>
      <StepProgressBar currentStep={4} />
      <OfflineBanner />
      <ScrollView>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.back}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Photos</Text>
          <Text style={styles.sub}>Both photos are required · {currentProduct?.name}</Text>
        </View>

        <View style={styles.slots}>
          {([0, 1] as const).map(idx => (
            <View key={idx} style={styles.slot}>
              <Text style={styles.slotLabel}>{LABELS[idx]}</Text>
              {slots[idx] ? (
                <View style={styles.photoPreview}>
                  <Image source={{ uri: slots[idx]!.uri }} style={styles.photo} />
                  <TouchableOpacity style={styles.retakeBtn} onPress={() => captureSlot(idx)}>
                    <Text style={styles.retakeText}>Retake</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.captureBtn, uploading[idx] && styles.btnDisabled]}
                  onPress={() => captureSlot(idx)}
                  disabled={uploading[idx]}
                >
                  {uploading[idx]
                    ? <ActivityIndicator color={COLORS.white} />
                    : <Text style={styles.captureBtnText}>📷 Take Photo</Text>
                  }
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.nextBtn, (!bothDone || anyUploading) && styles.btnDisabled]}
            onPress={handleNext}
            disabled={!bothDone || anyUploading}
          >
            <Text style={styles.nextBtnText}>Next → Confirm</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.offWhite },
  header: { padding: 20, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  back: { color: COLORS.blue, fontSize: 15, marginBottom: 10 },
  title: { color: COLORS.navy, fontSize: 22, fontWeight: '800', marginBottom: 2 },
  sub: { color: COLORS.gray500, fontSize: 14 },
  slots: { padding: 20, gap: 20 },
  slot: { backgroundColor: COLORS.white, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: COLORS.gray200 },
  slotLabel: { color: COLORS.navy, fontWeight: '700', fontSize: 15, marginBottom: 12 },
  captureBtn: { backgroundColor: COLORS.navy, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnDisabled: { opacity: 0.4 },
  captureBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  photoPreview: { gap: 8 },
  photo: { width: '100%', height: 160, borderRadius: 10, resizeMode: 'cover' },
  retakeBtn: { backgroundColor: COLORS.gray100, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  retakeText: { color: COLORS.gray600, fontWeight: '600', fontSize: 14 },
  footer: { padding: 20 },
  nextBtn: { backgroundColor: COLORS.green, borderRadius: 14, paddingVertical: 16, alignItems: 'center', minHeight: 54 },
  nextBtnText: { color: COLORS.white, fontSize: 17, fontWeight: '700' },
});
