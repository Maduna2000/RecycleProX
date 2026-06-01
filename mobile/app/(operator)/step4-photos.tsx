import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image, ActivityIndicator, Alert } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import { useOrderStore } from '@/stores/orderStore';
import { getPresignedUploadUrl, uploadToR2 } from '@/services/scaleService';
import { StepProgressBar } from '@/components/StepProgressBar';
import { OfflineBanner } from '@/components/OfflineBanner';
import { COLORS, MIN_TOUCH_TARGET } from '@/constants/theme';

const SLOTS = [
  { label: 'Scale Reading', hint: 'Photo of the scale display showing the weight', emoji: '⚖️' },
  { label: 'Product / Load', hint: 'Photo of the material being weighed', emoji: '📦' },
];

export default function Step4Photos() {
  const [photos, setPhotos] = useState<Array<{ uri: string; r2Key: string } | null>>([null, null]);
  const [uploading, setUploading] = useState<[boolean, boolean]>([false, false]);
  const { currentProduct, addPhoto, goToStep } = useOrderStore();

  const canProceed = photos.every((p) => p !== null);

  const handleCapture = async (slotIndex: number) => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Camera Access Required',
        'ScaleStation needs camera access to photograph scale readings. Please enable it in Settings.',
        [{ text: 'OK' }]
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets[0]) return;

    setUploading((prev) => { const next = [...prev] as [boolean, boolean]; next[slotIndex] = true; return next; });

    try {
      // Compress: max 1280px, 82% JPEG quality
      const compressed = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 1280 } }],
        { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG }
      );

      const filename = `scale-${Date.now()}-${slotIndex}.jpg`;
      const { uploadUrl, r2Key } = await getPresignedUploadUrl(filename, 'image/jpeg');
      await uploadToR2(uploadUrl, compressed.uri, 'image/jpeg');

      setPhotos((prev) => {
        const next = [...prev];
        next[slotIndex] = { uri: compressed.uri, r2Key };
        return next;
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Upload Failed', 'Could not upload photo. Please try again.');
    } finally {
      setUploading((prev) => { const next = [...prev] as [boolean, boolean]; next[slotIndex] = false; return next; });
    }
  };

  const handleRetake = (index: number) => {
    setPhotos((prev) => { const next = [...prev]; next[index] = null; return next; });
  };

  const handleNext = () => {
    photos.forEach((p) => { if (p) addPhoto(p.uri, p.r2Key); });
    router.push('/(operator)/step5-confirm');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.offWhite }}>
      <StepProgressBar currentStep={4} />
      <OfflineBanner />

      <View style={{ flex: 1, padding: 20 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={{ color: COLORS.blue, fontSize: 15, marginBottom: 12 }}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={{ color: COLORS.navy, fontSize: 22, fontWeight: '800', marginBottom: 6 }}>
          Take Photos
        </Text>
        <Text style={{ color: COLORS.gray500, fontSize: 14, marginBottom: 24 }}>
          Both photos are required before proceeding.
        </Text>

        <View style={{ gap: 16 }}>
          {SLOTS.map((slot, i) => (
            <View key={slot.label}>
              <Text style={{ color: COLORS.gray600, fontWeight: '700', fontSize: 14, marginBottom: 8 }}>
                {i + 1}. {slot.label}
              </Text>
              {photos[i] ? (
                <View style={{ borderRadius: 14, overflow: 'hidden', position: 'relative' }}>
                  <Image
                    source={{ uri: photos[i]!.uri }}
                    style={{ width: '100%', height: 180, borderRadius: 14 }}
                    resizeMode="cover"
                  />
                  <TouchableOpacity
                    onPress={() => handleRetake(i)}
                    style={{
                      position: 'absolute',
                      top: 10,
                      right: 10,
                      backgroundColor: 'rgba(0,0,0,0.6)',
                      borderRadius: 20,
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                    }}
                  >
                    <Text style={{ color: COLORS.white, fontSize: 13, fontWeight: '600' }}>Retake</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => handleCapture(i)}
                  disabled={uploading[i]}
                  style={{
                    height: 160,
                    backgroundColor: COLORS.white,
                    borderRadius: 14,
                    borderWidth: 2,
                    borderColor: COLORS.gray200,
                    borderStyle: 'dashed',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                  }}
                  activeOpacity={0.85}
                >
                  {uploading[i] ? (
                    <>
                      <ActivityIndicator color={COLORS.navy} />
                      <Text style={{ color: COLORS.gray500, fontSize: 13 }}>Uploading...</Text>
                    </>
                  ) : (
                    <>
                      <Text style={{ fontSize: 36 }}>{slot.emoji}</Text>
                      <Text style={{ color: COLORS.navy, fontWeight: '700', fontSize: 15 }}>
                        Tap to capture
                      </Text>
                      <Text style={{ color: COLORS.gray400, fontSize: 12, textAlign: 'center', paddingHorizontal: 20 }}>
                        {slot.hint}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      </View>

      <View style={{ paddingHorizontal: 20, paddingBottom: 24 }}>
        <TouchableOpacity
          onPress={handleNext}
          disabled={!canProceed}
          style={{
            backgroundColor: canProceed ? COLORS.green : COLORS.gray300,
            borderRadius: 14,
            paddingVertical: 16,
            alignItems: 'center',
            minHeight: 54,
          }}
          activeOpacity={0.85}
        >
          <Text style={{ color: COLORS.white, fontSize: 17, fontWeight: '700' }}>Next →</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
