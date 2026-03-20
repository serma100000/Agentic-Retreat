import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { Outage } from '../navigation/types';
import { StatusBadge } from './StatusBadge';

interface OutageCardProps {
  outage: Outage;
}

const SERVICE_ICONS: Record<string, string> = {
  cloud: '  ',
  cdn: '  ',
  dns: '  ',
  api: '  ',
  database: '  ',
  default: '  ',
};

export function OutageCard({ outage }: OutageCardProps): React.JSX.Element {
  const navigation = useNavigation();

  const duration = formatDuration(outage.startedAt);

  const handlePress = () => {
    navigation.navigate('Services', {
      screen: 'ServiceDetail',
      params: {
        serviceId: outage.serviceId,
        serviceName: outage.serviceName,
      },
    });
  };

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.icon}>
            {SERVICE_ICONS.default}
          </Text>
          <Text style={styles.serviceName} numberOfLines={1}>
            {outage.serviceName}
          </Text>
        </View>
        <StatusBadge status={outage.status} size="small" />
      </View>

      <View style={styles.details}>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Confidence</Text>
          <Text style={styles.detailValue}>
            {Math.round(outage.confidence * 100)}%
          </Text>
        </View>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Duration</Text>
          <Text style={styles.detailValue}>{duration}</Text>
        </View>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Reports</Text>
          <Text style={styles.detailValue}>{outage.reportCount}</Text>
        </View>
      </View>

      {outage.regions.length > 0 && (
        <View style={styles.regionsRow}>
          {outage.regions.slice(0, 4).map((region) => (
            <View key={region} style={styles.regionChip}>
              <Text style={styles.regionText}>{region}</Text>
            </View>
          ))}
          {outage.regions.length > 4 && (
            <View style={styles.regionChip}>
              <Text style={styles.regionText}>
                +{outage.regions.length - 4}
              </Text>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

function formatDuration(startedAt: string): string {
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  const diffMs = now - start;

  if (diffMs < 0) return 'Just now';

  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const remainMin = minutes % 60;
    return remainMin > 0 ? `${hours}h ${remainMin}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const remainHours = hours % 24;
  return remainHours > 0 ? `${days}d ${remainHours}h` : `${days}d`;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  icon: {
    fontSize: 18,
    marginRight: 8,
  },
  serviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  details: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  detailItem: {
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  regionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  regionChip: {
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  regionText: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
  },
});
