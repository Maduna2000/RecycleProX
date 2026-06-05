import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Image,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '@/stores/authStore';
import { COLORS } from '@/constants/theme';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { login, isLoading, error, clearError } = useAuthStore();

  async function handleLogin() {
    if (!username.trim() || !password.trim()) return;
    clearError();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const ok = await login(username.trim(), password);
    if (ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(operator)');
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Image
            source={require('@/assets/splash-icon.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.title}>Scale Station</Text>
          <Text style={styles.subtitle}>Sign in to your operator account</Text>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.form}>
            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Enter username"
              placeholderTextColor={COLORS.gray500}
              returnKeyType="next"
              editable={!isLoading}
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Enter password"
              placeholderTextColor={COLORS.gray500}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              editable={!isLoading}
            />

            <TouchableOpacity
              style={[styles.btn, isLoading && styles.btnDisabled]}
              onPress={handleLogin}
              disabled={isLoading || !username.trim() || !password.trim()}
              activeOpacity={0.85}
            >
              {isLoading ? (
                <ActivityIndicator color={COLORS.white} size="small" />
              ) : (
                <Text style={styles.btnText}>Sign In</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.navy },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  logo: { width: 100, height: 100, marginBottom: 16 },
  title: { color: COLORS.white, fontSize: 28, fontWeight: '800', marginBottom: 4 },
  subtitle: { color: 'rgba(255,255,255,0.6)', fontSize: 15, marginBottom: 32, textAlign: 'center' },
  errorBox: {
    width: '100%', backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: 10,
    padding: 12, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)',
  },
  errorText: { color: '#FCA5A5', fontSize: 14, textAlign: 'center' },
  form: { width: '100%', gap: 8 },
  label: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600', marginBottom: 4 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 14,
    color: COLORS.white, fontSize: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    marginBottom: 12,
  },
  btn: {
    backgroundColor: COLORS.green, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginTop: 8, minHeight: 54,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: COLORS.white, fontSize: 17, fontWeight: '700' },
});
