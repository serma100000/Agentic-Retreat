import React, { useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useAppStore } from '../lib/store';
import { OutageCard } from '../components/OutageCard';
import type { Outage, RootTabScreenProps } from '../navigation/types';

const AUTO_REFRESH_INTERVAL = 30_000;

export function DashboardScreen(
  _props: RootTabScreenProps<'Dashboard'>,
): React.JSX.Element {
  const {
    activeOutages,
    services,
    fetchOutages,
    fetchServices,
    isLoading,
  } = useAppStore();

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    await Promise.all([fetchOutages(), fetchServices()]);
  }, [fetchOutages, fetchServices]);

  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(refresh, AUTO_REFRESH_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refresh]);

  const todayReports = activeOutages.reduce(
    (sum, o) => sum + o.reportCount,
    0,
  );

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      <Text style={styles.title}>Dashboard</Text>
      <Text style={styles.subtitle}>Real-time service monitoring</Text>

      {/* Stats Bar */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{services.length}</Text>
          <Text style={styles.statLabel}>Services</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text
            style={[
              styles.statValue,
              activeOutages.length > 0 && styles.statValueAlert,
            ]}
          >
            {activeOutages.length}
          </Text>
          <Text style={styles.statLabel}>Outages</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{todayReports}</Text>
          <Text style={styles.statLabel}>Reports Today</Text>
        </View>
      </View>

      {activeOutages.length > 0 && (
        <Text style={styles.sectionTitle}>Active Outages</Text>
      )}
    </View>
  );

  const renderEmpty = () => {
    if (isLoading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.emptyText}>Loading...</Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.checkmark}>OK</Text>
        <Text style={styles.allGoodTitle}>All Systems Operational</Text>
        <Text style={styles.allGoodSubtitle}>
          No active outages detected across all monitored services.
        </Text>
      </View>
    );
  };

  const renderOutageItem = ({ item }: { item: Outage }) => (
    <OutageCard outage={item} />
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={activeOutages}
        renderItem={renderOutageItem}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refresh}
            tintColor="#3B82F6"
            colors={['#3B82F6']}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  listContent: {
    paddingBottom: 24,
  },
  headerContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
  },
  statsBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  statValueAlert: {
    color: '#EF4444',
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  emptyText: {
    marginTop: 12,
    color: '#6B7280',
    fontSize: 14,
  },
  checkmark: {
    fontSize: 24,
    fontWeight: '700',
    color: '#22C55E',
    marginBottom: 12,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
    overflow: 'hidden',
  },
  allGoodTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  allGoodSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
});
