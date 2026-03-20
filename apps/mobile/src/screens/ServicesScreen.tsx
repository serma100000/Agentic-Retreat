import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAppStore } from '../lib/store';
import { StatusBadge } from '../components/StatusBadge';
import { ServiceDetailScreen } from './ServiceDetailScreen';
import type { Service, ServicesStackParamList, ServicesStackScreenProps } from '../navigation/types';

const Stack = createNativeStackNavigator<ServicesStackParamList>();

export function ServicesScreen(): React.JSX.Element {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="ServicesList"
        component={ServicesListScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ServiceDetail"
        component={ServiceDetailScreen}
        options={({ route }) => ({
          title: route.params.serviceName,
          headerBackTitle: 'Services',
        })}
      />
    </Stack.Navigator>
  );
}

const CATEGORIES = [
  'All',
  'Cloud',
  'CDN',
  'DNS',
  'API',
  'Database',
  'Messaging',
  'Payment',
  'Auth',
  'Other',
];

const CATEGORY_ICONS: Record<string, string> = {
  Cloud: 'C',
  CDN: 'N',
  DNS: 'D',
  API: 'A',
  Database: 'DB',
  Messaging: 'M',
  Payment: 'P',
  Auth: 'Au',
  Other: '?',
};

function ServicesListScreen(
  _props: ServicesStackScreenProps<'ServicesList'>,
): React.JSX.Element {
  const { services, fetchServices, isLoading } = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  const filteredServices = useMemo(() => {
    let result = services;

    if (selectedCategory !== 'All') {
      result = result.filter(
        (s) => s.category.toLowerCase() === selectedCategory.toLowerCase(),
      );
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.category.toLowerCase().includes(query),
      );
    }

    return result;
  }, [services, searchQuery, selectedCategory]);

  const handleRefresh = useCallback(() => {
    fetchServices();
  }, [fetchServices]);

  const renderServiceItem = ({ item }: { item: Service }) => (
    <ServiceItem service={item} />
  );

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Text style={styles.title}>Services</Text>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>Search</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search services..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Text style={styles.clearButton}>X</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Category Filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoriesContainer}
        style={styles.categoriesScroll}
      >
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[
              styles.categoryChip,
              selectedCategory === cat && styles.categoryChipActive,
            ]}
            onPress={() => setSelectedCategory(cat)}
          >
            <Text
              style={[
                styles.categoryText,
                selectedCategory === cat && styles.categoryTextActive,
              ]}
            >
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Service List */}
      <FlatList
        data={filteredServices}
        renderItem={renderServiceItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={handleRefresh}
            tintColor="#3B82F6"
            colors={['#3B82F6']}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {searchQuery
                ? 'No services match your search'
                : 'No services found'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

function ServiceItem({ service }: { service: Service }): React.JSX.Element {
  const navigation = _useServiceNavigation();

  const handlePress = () => {
    navigation.navigate('ServiceDetail', {
      serviceId: service.id,
      serviceName: service.name,
    });
  };

  const categoryIcon = CATEGORY_ICONS[service.category] ?? '?';

  return (
    <TouchableOpacity
      style={styles.serviceItem}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <View style={styles.serviceIconContainer}>
        <Text style={styles.serviceIcon}>{categoryIcon}</Text>
      </View>
      <View style={styles.serviceInfo}>
        <Text style={styles.serviceName} numberOfLines={1}>
          {service.name}
        </Text>
        <Text style={styles.serviceCategory}>{service.category}</Text>
      </View>
      <StatusBadge status={service.status} size="small" />
    </TouchableOpacity>
  );
}

function _useServiceNavigation() {
  const navigation =
    require('@react-navigation/native').useNavigation<
      ServicesStackScreenProps<'ServicesList'>['navigation']
    >();
  return navigation;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchIcon: {
    fontSize: 12,
    color: '#9CA3AF',
    marginRight: 8,
    fontWeight: '500',
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
    padding: 0,
  },
  clearButton: {
    fontSize: 14,
    color: '#9CA3AF',
    padding: 4,
    fontWeight: '600',
  },
  categoriesScroll: {
    maxHeight: 48,
  },
  categoriesContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  categoryChip: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginRight: 8,
  },
  categoryChipActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  categoryText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
  },
  categoryTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    paddingBottom: 24,
  },
  serviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginVertical: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  serviceIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  serviceIcon: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3B82F6',
  },
  serviceInfo: {
    flex: 1,
    marginRight: 8,
  },
  serviceName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  serviceCategory: {
    fontSize: 12,
    color: '#6B7280',
  },
  emptyContainer: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 14,
  },
});
