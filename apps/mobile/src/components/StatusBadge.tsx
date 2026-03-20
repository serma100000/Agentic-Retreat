import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type StatusType = 'operational' | 'degraded' | 'outage' | 'investigating' | 'unknown';
type BadgeSize = 'small' | 'medium' | 'large';

interface StatusBadgeProps {
  status: StatusType;
  size?: BadgeSize;
  showDot?: boolean;
}

const STATUS_CONFIG: Record<StatusType, { bg: string; text: string; label: string }> = {
  operational: { bg: '#DCFCE7', text: '#166534', label: 'Operational' },
  degraded: { bg: '#FEF3C7', text: '#92400E', label: 'Degraded' },
  outage: { bg: '#FEE2E2', text: '#991B1B', label: 'Outage' },
  investigating: { bg: '#DBEAFE', text: '#1E40AF', label: 'Investigating' },
  unknown: { bg: '#F3F4F6', text: '#374151', label: 'Unknown' },
};

const SIZE_CONFIG: Record<BadgeSize, { paddingH: number; paddingV: number; fontSize: number; dotSize: number }> = {
  small: { paddingH: 6, paddingV: 2, fontSize: 10, dotSize: 6 },
  medium: { paddingH: 10, paddingV: 4, fontSize: 12, dotSize: 8 },
  large: { paddingH: 14, paddingV: 6, fontSize: 14, dotSize: 10 },
};

export function StatusBadge({
  status,
  size = 'medium',
  showDot = true,
}: StatusBadgeProps): React.JSX.Element {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.unknown;
  const sizeConfig = SIZE_CONFIG[size];

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: config.bg,
          paddingHorizontal: sizeConfig.paddingH,
          paddingVertical: sizeConfig.paddingV,
        },
      ]}
    >
      {showDot && (
        <View
          style={[
            styles.dot,
            {
              width: sizeConfig.dotSize,
              height: sizeConfig.dotSize,
              borderRadius: sizeConfig.dotSize / 2,
              backgroundColor: config.text,
            },
          ]}
        />
      )}
      <Text
        style={[
          styles.label,
          { color: config.text, fontSize: sizeConfig.fontSize },
        ]}
      >
        {config.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  dot: {
    marginRight: 4,
  },
  label: {
    fontWeight: '600',
  },
});
