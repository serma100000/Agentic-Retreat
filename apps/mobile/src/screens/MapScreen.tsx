import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  RefreshControl,
} from 'react-native';
import Svg, { Circle, Text as SvgText, Rect } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import { useAppStore } from '../lib/store';
import { StatusBadge } from '../components/StatusBadge';
import type { Outage, RootTabScreenProps } from '../navigation/types';

const SCREEN_WIDTH = Dimensions.get('window').width;
const MAP_HEIGHT = 300;

// Simplified world map region coordinates (projected to screen space)
const REGION_POSITIONS: Record<string, { x: number; y: number; label: string }> = {
  'us-east': { x: 0.25, y: 0.35, label: 'US East' },
  'us-west': { x: 0.12, y: 0.35, label: 'US West' },
  'eu-west': { x: 0.47, y: 0.28, label: 'EU West' },
  'eu-central': { x: 0.52, y: 0.26, label: 'EU Central' },
  'ap-southeast': { x: 0.78, y: 0.55, label: 'AP Southeast' },
  'ap-northeast': { x: 0.82, y: 0.32, label: 'AP Northeast' },
  'sa-east': { x: 0.3, y: 0.65, label: 'SA East' },
  'af-south': { x: 0.53, y: 0.6, label: 'AF South' },
  'me-south': { x: 0.58, y: 0.4, label: 'ME South' },
  'ap-south': { x: 0.68, y: 0.42, label: 'AP South' },
};

export function MapScreen(
  _props: RootTabScreenProps<'Map'>,
): React.JSX.Element {
  const { activeOutages, fetchOutages } = useAppStore();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const navigation = useNavigation();

  useEffect(() => {
    fetchOutages();
  }, [fetchOutages]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchOutages();
    setRefreshing(false);
  }, [fetchOutages]);

  // Build a map of region -> outages
  const regionOutages = useMemo(() => {
    const map: Record<string, Outage[]> = {};
    for (const outage of activeOutages) {
      for (const region of outage.regions) {
        const key = region.toLowerCase().replace(/\s+/g, '-');
        if (!map[key]) map[key] = [];
        map[key].push(outage);
      }
    }
    return map;
  }, [activeOutages]);

  // Determine marker color based on worst severity in region
  const getRegionColor = (regionKey: string): string => {
    const outages = regionOutages[regionKey];
    if (!outages || outages.length === 0) return '#22C55E';
    const hasOutage = outages.some((o) => o.status === 'outage');
    if (hasOutage) return '#EF4444';
    return '#F59E0B';
  };

  const getRegionSize = (regionKey: string): number => {
    const outages = regionOutages[regionKey];
    if (!outages || outages.length === 0) return 8;
    return Math.min(8 + outages.length * 3, 20);
  };

  const filteredOutages = useMemo(() => {
    if (!selectedRegion) return activeOutages;
    return activeOutages.filter((o) =>
      o.regions.some(
        (r) => r.toLowerCase().replace(/\s+/g, '-') === selectedRegion,
      ),
    );
  }, [activeOutages, selectedRegion]);

  const handleOutagePress = (outage: Outage) => {
    navigation.navigate('Services', {
      screen: 'ServiceDetail',
      params: {
        serviceId: outage.serviceId,
        serviceName: outage.serviceName,
      },
    });
  };

  return (
    <View style={styles.container}>
      {/* Map */}
      <View style={styles.mapContainer}>
        <Svg width={SCREEN_WIDTH} height={MAP_HEIGHT}>
          {/* Background */}
          <Rect
            x={0}
            y={0}
            width={SCREEN_WIDTH}
            height={MAP_HEIGHT}
            fill="#1E293B"
            rx={0}
          />

          {/* Grid lines for visual reference */}
          {[0.25, 0.5, 0.75].map((ratio) => (
            <React.Fragment key={`grid-${ratio}`}>
              <Rect
                x={SCREEN_WIDTH * ratio}
                y={0}
                width={1}
                height={MAP_HEIGHT}
                fill="#334155"
                opacity={0.5}
              />
              <Rect
                x={0}
                y={MAP_HEIGHT * ratio}
                width={SCREEN_WIDTH}
                height={1}
                fill="#334155"
                opacity={0.5}
              />
            </React.Fragment>
          ))}

          {/* Region markers */}
          {Object.entries(REGION_POSITIONS).map(([key, pos]) => {
            const color = getRegionColor(key);
            const size = getRegionSize(key);
            const isSelected = selectedRegion === key;
            const hasOutages = (regionOutages[key]?.length ?? 0) > 0;

            return (
              <React.Fragment key={key}>
                {/* Pulse ring for active outages */}
                {hasOutages && (
                  <Circle
                    cx={pos.x * SCREEN_WIDTH}
                    cy={pos.y * MAP_HEIGHT}
                    r={size + 6}
                    fill={color}
                    opacity={0.2}
                  />
                )}

                {/* Selection ring */}
                {isSelected && (
                  <Circle
                    cx={pos.x * SCREEN_WIDTH}
                    cy={pos.y * MAP_HEIGHT}
                    r={size + 4}
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth={2}
                  />
                )}

                {/* Main dot */}
                <Circle
                  cx={pos.x * SCREEN_WIDTH}
                  cy={pos.y * MAP_HEIGHT}
                  r={size}
                  fill={color}
                  onPress={() =>
                    setSelectedRegion(
                      selectedRegion === key ? null : key,
                    )
                  }
                />

                {/* Label */}
                <SvgText
                  x={pos.x * SCREEN_WIDTH}
                  y={pos.y * MAP_HEIGHT + size + 14}
                  textAnchor="middle"
                  fontSize={9}
                  fill="#94A3B8"
                  fontWeight="500"
                >
                  {pos.label}
                </SvgText>
              </React.Fragment>
            );
          })}
        </Svg>

        {/* Region filter indicator */}
        {selectedRegion && (
          <TouchableOpacity
            style={styles.filterBadge}
            onPress={() => setSelectedRegion(null)}
          >
            <Text style={styles.filterBadgeText}>
              {REGION_POSITIONS[selectedRegion]?.label ?? selectedRegion}
              {'  X'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Outage List */}
      <View style={styles.listContainer}>
        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>
            {selectedRegion
              ? `Outages in ${REGION_POSITIONS[selectedRegion]?.label ?? selectedRegion}`
              : 'Active Outages'}
          </Text>
          <Text style={styles.listCount}>{filteredOutages.length}</Text>
        </View>

        <FlatList
          data={filteredOutages}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#3B82F6"
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.outageItem}
              onPress={() => handleOutagePress(item)}
              activeOpacity={0.7}
            >
              <View style={styles.outageItemHeader}>
                <Text style={styles.outageServiceName} numberOfLines={1}>
                  {item.serviceName}
                </Text>
                <StatusBadge status={item.status} size="small" />
              </View>
              <View style={styles.outageItemMeta}>
                <Text style={styles.outageItemRegions}>
                  {item.regions.join(', ')}
                </Text>
                <Text style={styles.outageItemReports}>
                  {item.reportCount} reports
                </Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>No Active Outages</Text>
              <Text style={styles.emptySubtitle}>
                {selectedRegion
                  ? 'No outages in this region'
                  : 'All systems are operational'}
              </Text>
            </View>
          }
          contentContainerStyle={styles.listContent}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  mapContainer: {
    position: 'relative',
  },
  filterBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#3B82F6',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  filterBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  listContainer: {
    flex: 1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: '#F9FAFB',
    marginTop: -16,
    paddingTop: 8,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  listTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  listCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    overflow: 'hidden',
  },
  listContent: {
    paddingBottom: 24,
  },
  outageItem: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  outageItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  outageServiceName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    marginRight: 8,
  },
  outageItemMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  outageItemRegions: {
    fontSize: 12,
    color: '#6B7280',
    flex: 1,
  },
  outageItemReports: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#9CA3AF',
  },
});
