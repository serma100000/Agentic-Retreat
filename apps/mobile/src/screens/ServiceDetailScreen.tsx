import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { StatusBadge } from '../components/StatusBadge';
import { ReportChart } from '../components/ReportChart';
import { useAppStore } from '../lib/store';
import * as api from '../lib/api';
import type {
  Service,
  Outage,
  ProbeResult,
  ServicesStackScreenProps,
} from '../navigation/types';

export function ServiceDetailScreen({
  route,
}: ServicesStackScreenProps<'ServiceDetail'>): React.JSX.Element {
  const { serviceId } = route.params;
  const { submitReport } = useAppStore();

  const [service, setService] = useState<Service | null>(null);
  const [probes, setProbes] = useState<ProbeResult[]>([]);
  const [outages, setOutages] = useState<Outage[]>([]);
  const [chartData, setChartData] = useState<{ hour: string; count: number }[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [svc, probeData, outageData, reportStats] = await Promise.all([
        api.getService(serviceId),
        api.getServiceProbes(serviceId),
        api.getServiceOutages(serviceId),
        api.getReportStats(serviceId),
      ]);
      setService(svc);
      setProbes(probeData);
      setOutages(outageData);
      setChartData(reportStats.hourly);
    } catch (err) {
      Alert.alert('Error', 'Failed to load service details');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [serviceId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const handleReportProblem = () => {
    Alert.alert('Report a Problem', 'What are you experiencing?', [
      {
        text: 'Outage',
        onPress: () => handleSubmitReport('outage'),
      },
      {
        text: 'Degraded Performance',
        onPress: () => handleSubmitReport('degraded'),
      },
      {
        text: 'Working Fine',
        onPress: () => handleSubmitReport('operational'),
        style: 'default',
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleSubmitReport = async (
    type: 'outage' | 'degraded' | 'operational',
  ) => {
    try {
      await submitReport(serviceId, type);
      Alert.alert('Thank you', 'Your report has been submitted.');
      loadData();
    } catch {
      Alert.alert('Error', 'Failed to submit report. Please try again.');
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  if (!service) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Service not found</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor="#3B82F6"
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.serviceName}>{service.name}</Text>
          <StatusBadge status={service.status} size="large" />
        </View>
        <View style={styles.headerMeta}>
          <Text style={styles.category}>{service.category}</Text>
          <Text style={styles.confidence}>
            Confidence: {Math.round(service.confidence * 100)}%
          </Text>
        </View>
        <Text style={styles.lastChecked}>
          Last checked: {formatTime(service.lastChecked)}
        </Text>
      </View>

      {/* Report Button */}
      <TouchableOpacity
        style={styles.reportButton}
        onPress={handleReportProblem}
        activeOpacity={0.8}
      >
        <Text style={styles.reportButtonText}>Report a Problem</Text>
      </TouchableOpacity>

      {/* Report Chart */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Reports (24h)</Text>
        <View style={styles.chartContainer}>
          <ReportChart data={chartData} />
        </View>
      </View>

      {/* Probe Status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Probe Status by Region</Text>
        {probes.length === 0 ? (
          <Text style={styles.noDataText}>No probe data available</Text>
        ) : (
          probes.map((probe) => (
            <View key={probe.region} style={styles.probeRow}>
              <View style={styles.probeLeft}>
                <View
                  style={[
                    styles.probeDot,
                    {
                      backgroundColor:
                        probe.status === 'up'
                          ? '#22C55E'
                          : probe.status === 'degraded'
                            ? '#F59E0B'
                            : '#EF4444',
                    },
                  ]}
                />
                <Text style={styles.probeRegion}>{probe.region}</Text>
              </View>
              <View style={styles.probeRight}>
                <Text style={styles.probeLatency}>{probe.latency}ms</Text>
                <Text style={styles.probeStatus}>{probe.status}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Recent Outages */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Outage History</Text>
        {outages.length === 0 ? (
          <Text style={styles.noDataText}>No recent outages</Text>
        ) : (
          outages.slice(0, 5).map((outage) => (
            <View key={outage.id} style={styles.outageHistoryItem}>
              <View style={styles.outageHistoryHeader}>
                <StatusBadge status={outage.status} size="small" />
                <Text style={styles.outageDate}>
                  {formatDate(outage.startedAt)}
                </Text>
              </View>
              <View style={styles.outageHistoryMeta}>
                <Text style={styles.outageMetaText}>
                  {Math.round(outage.confidence * 100)}% confidence
                </Text>
                <Text style={styles.outageMetaText}>
                  {outage.reportCount} reports
                </Text>
                <Text style={styles.outageMetaText}>
                  {outage.resolvedAt
                    ? `Resolved: ${formatTime(outage.resolvedAt)}`
                    : 'Ongoing'}
                </Text>
              </View>
              {outage.regions.length > 0 && (
                <View style={styles.outageRegions}>
                  {outage.regions.map((r) => (
                    <View key={r} style={styles.outageRegionChip}>
                      <Text style={styles.outageRegionText}>{r}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function formatTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return dateStr;
  }
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  contentContainer: {
    paddingBottom: 32,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
  },
  errorText: {
    color: '#6B7280',
    fontSize: 16,
  },
  header: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  serviceName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
    marginRight: 12,
  },
  headerMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  category: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  confidence: {
    fontSize: 14,
    color: '#3B82F6',
    fontWeight: '600',
  },
  lastChecked: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  reportButton: {
    backgroundColor: '#3B82F6',
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  reportButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  section: {
    marginTop: 20,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  chartContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  noDataText: {
    color: '#9CA3AF',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 16,
  },
  probeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  probeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  probeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  probeRegion: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  probeRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  probeLatency: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  probeStatus: {
    fontSize: 12,
    color: '#9CA3AF',
    textTransform: 'capitalize',
  },
  outageHistoryItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  outageHistoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  outageDate: {
    fontSize: 12,
    color: '#6B7280',
  },
  outageHistoryMeta: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 6,
  },
  outageMetaText: {
    fontSize: 12,
    color: '#6B7280',
  },
  outageRegions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  outageRegionChip: {
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  outageRegionText: {
    fontSize: 11,
    color: '#6B7280',
  },
});
