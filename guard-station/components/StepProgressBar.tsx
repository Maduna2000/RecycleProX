import React from 'react';
import { View, Text } from 'react-native';
import { COLORS } from '@/constants/theme';

type StepProgressBarProps = {
  currentStep: number;
  // Unlike Scale Station's fixed 6 steps, Guard Station's visible step count
  // varies by purpose — 'sell' shows Category, other purposes skip it (see
  // entryStore's displaySteps, mirroring gate/page.tsx's displayStepIndex
  // mapping on the web) — so the label set is passed in, not hardcoded here.
  steps: string[];
};

export function StepProgressBar({ currentStep, steps }: StepProgressBarProps) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: COLORS.navy,
        gap: 0,
      }}
    >
      {steps.map((label, index) => {
        const step = index + 1;
        const isCompleted = step < currentStep;
        const isActive = step === currentStep;

        return (
          <React.Fragment key={step}>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isCompleted
                    ? COLORS.blue
                    : isActive
                    ? COLORS.white
                    : 'rgba(255,255,255,0.2)',
                  borderWidth: isActive ? 2 : 0,
                  borderColor: isActive ? COLORS.blue : 'transparent',
                }}
              >
                {isCompleted ? (
                  <Text style={{ color: COLORS.white, fontSize: 14, fontWeight: '700' }}>✓</Text>
                ) : (
                  <Text
                    style={{
                      color: isActive ? COLORS.navy : 'rgba(255,255,255,0.5)',
                      fontSize: 12,
                      fontWeight: '700',
                    }}
                  >
                    {step}
                  </Text>
                )}
              </View>
              <Text
                style={{
                  color: isActive
                    ? COLORS.white
                    : isCompleted
                    ? COLORS.blue
                    : 'rgba(255,255,255,0.4)',
                  fontSize: 9,
                  marginTop: 3,
                  fontWeight: isActive ? '600' : '400',
                }}
                numberOfLines={1}
              >
                {label}
              </Text>
            </View>
            {index < steps.length - 1 && (
              <View
                style={{
                  height: 2,
                  flex: 0.3,
                  backgroundColor: isCompleted ? COLORS.blue : 'rgba(255,255,255,0.2)',
                  marginBottom: 14,
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}
