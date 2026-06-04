import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, ActivityIndicator, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getPairedPrinters,
  requestPrinterPermissions,
  type Printer,
} from 'expo-thermal-printer';
import { usePrinterStore } from '@/stores/printerStore';
import { COLORS, MIN_TOUCH_TARGET } from '@/constants/theme';

type ScanState = 'loading' | 'list' | 'none' | 'permission-denied';

export default function PrinterSetupScreen() {
  const [scanState, setScanState]   = useState<ScanState>('loading');
  const [printers,  setPrinters]    = useState<Printer[]>([]);
  const { printerAddress, loadSavedAddress, savePrinterAddress, clearPrinterAddress } = usePrinterStore();

  useEffect(() => {
    loadSavedAddress();
    scan();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function scan() {
    setScanState('loading');
    try {
      const granted = await requestPrinterPermissions();
      if (!granted) {
        setScanState('permission-denied');
        return;
      }
      const list = await getPairedPrinters();
      setPrinters(list);
      setScanState(list.length > 0 ? 'list' : 'none');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not scan for printers');
      setScanState('none');
    }
  }

  function handleSelect(address: string) {
    savePrinterAddress(address);
  }

  function handleClear() {
    Alert.alert('Clear Printer', 'Remove the saved printer selection?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: clearPrinterAddress },
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.offWhite }}>
      {/* Header */}
      <View style={{
        backgroundColor: COLORS.white,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.gray100,
        padding: 20,
      }}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={{ color: COLORS.blue, fontSize: 15, marginBottom: 12 }}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={{ color: COLORS.navy, fontSize: 22, fontWeight: '800', marginBottom: 4 }}>
          Printer Setup
        </Text>
        <Text style={{ color: COLORS.gray500, fontSize: 14 }}>
          Select your Bluetooth thermal printer
        </Text>
      </View>

      {/* Currently selected */}
      {printerAddress && (
        <View style={{
          margin: 16,
          padding: 14,
          backgroundColor: COLORS.green + '15',
          borderRadius: 12,
          borderWidth: 1,
          borderColor: COLORS.green + '40',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <View>
            <Text style={{ color: COLORS.green, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>
              Active Printer
            </Text>
            <Text style={{ color: COLORS.gray800, fontSize: 13, fontFamily: 'monospace', marginTop: 2 }}>
              {printerAddress}
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleClear}
            style={{ minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: COLORS.red ?? '#EF4444', fontSize: 13, fontWeight: '600' }}>Clear</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* States */}
      {scanState === 'loading' && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <ActivityIndicator color={COLORS.green} size="large" />
          <Text style={{ color: COLORS.gray500 }}>Scanning for paired printers…</Text>
        </View>
      )}

      {scanState === 'permission-denied' && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 }}>
          <Text style={{ fontSize: 40 }}>🔒</Text>
          <Text style={{ color: COLORS.navy, fontSize: 18, fontWeight: '700', textAlign: 'center' }}>
            Bluetooth Permission Required
          </Text>
          <Text style={{ color: COLORS.gray500, textAlign: 'center', lineHeight: 22 }}>
            Go to Settings → ScaleStation → Permissions and enable Nearby Devices.
          </Text>
          <TouchableOpacity
            onPress={scan}
            style={{
              backgroundColor: COLORS.green,
              borderRadius: 12,
              paddingVertical: 14,
              paddingHorizontal: 32,
              minHeight: MIN_TOUCH_TARGET,
              alignItems: 'center',
            }}
            activeOpacity={0.85}
          >
            <Text style={{ color: COLORS.white, fontWeight: '700', fontSize: 16 }}>Try Again</Text>
          </TouchableOpacity>
        </View>
      )}

      {scanState === 'none' && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 }}>
          <Text style={{ fontSize: 40 }}>📡</Text>
          <Text style={{ color: COLORS.navy, fontSize: 18, fontWeight: '700', textAlign: 'center' }}>
            No Printers Found
          </Text>
          <Text style={{ color: COLORS.gray500, textAlign: 'center', lineHeight: 22 }}>
            Pair your Bluetooth thermal printer in Android Settings → Bluetooth first, then come back.
          </Text>
          <TouchableOpacity
            onPress={scan}
            style={{
              backgroundColor: COLORS.navy,
              borderRadius: 12,
              paddingVertical: 14,
              paddingHorizontal: 32,
              minHeight: MIN_TOUCH_TARGET,
              alignItems: 'center',
            }}
            activeOpacity={0.85}
          >
            <Text style={{ color: COLORS.white, fontWeight: '700', fontSize: 16 }}>Scan Again</Text>
          </TouchableOpacity>
        </View>
      )}

      {scanState === 'list' && (
        <FlatList
          data={printers}
          keyExtractor={(p) => p.address}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          ListHeaderComponent={
            <Text style={{
              color: COLORS.gray600, fontSize: 11, fontWeight: '700',
              textTransform: 'uppercase', marginBottom: 4,
            }}>
              Paired Devices
            </Text>
          }
          renderItem={({ item: printer }) => {
            const active = printerAddress === printer.address;
            return (
              <TouchableOpacity
                onPress={() => handleSelect(printer.address)}
                style={{
                  backgroundColor: active ? COLORS.green + '15' : COLORS.white,
                  borderRadius: 14,
                  padding: 16,
                  borderWidth: 2,
                  borderColor: active ? COLORS.green : COLORS.gray200,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  minHeight: MIN_TOUCH_TARGET,
                }}
                activeOpacity={0.85}
              >
                <View style={{
                  width: 44, height: 44, borderRadius: 10,
                  backgroundColor: COLORS.gray100,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontSize: 22 }}>🖨️</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.gray800, fontWeight: '700', fontSize: 15 }}>
                    {printer.name || 'Unknown device'}
                  </Text>
                  <Text style={{ color: COLORS.gray500, fontSize: 12, fontFamily: 'monospace' }}>
                    {printer.address}
                  </Text>
                  <View style={{
                    marginTop: 4,
                    alignSelf: 'flex-start',
                    backgroundColor: printer.type === 'ble' ? '#EFF6FF' : COLORS.gray100,
                    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6,
                  }}>
                    <Text style={{
                      fontSize: 11, fontWeight: '600',
                      color: printer.type === 'ble' ? '#1D4ED8' : COLORS.gray600,
                    }}>
                      {printer.type === 'ble' ? 'Bluetooth LE' : 'Classic BT'}
                    </Text>
                  </View>
                </View>
                {active && <Text style={{ fontSize: 22 }}>✓</Text>}
              </TouchableOpacity>
            );
          }}
          ItemSeparatorComponent={() => <View style={{ height: 0 }} />}
        />
      )}
    </SafeAreaView>
  );
}
