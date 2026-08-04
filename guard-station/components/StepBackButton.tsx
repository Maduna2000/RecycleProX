import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { COLORS } from '@/constants/theme';

// Explicit, visible back affordance — the Stack is headerShown:false (no
// native back chevron) and the Android system nav bar is hidden for kiosk
// mode, so without this a guard has no discoverable way back to the
// previous step. router.back() pops to the step screen's existing mounted
// instance rather than pushing a fresh one, so whatever the guard already
// typed there is still on screen, not just in entryStore.
export function StepBackButton() {
  return (
    <TouchableOpacity
      style={styles.btn}
      onPress={() => router.back()}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      activeOpacity={0.7}
    >
      <ChevronLeft color={COLORS.gray600} size={18} />
      <Text style={styles.text}>Back</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 20, paddingTop: 12 },
  text: { color: COLORS.gray600, fontSize: 14, fontWeight: '600' },
});
