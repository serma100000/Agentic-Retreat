import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type ServicesStackParamList = {
  ServicesList: undefined;
  ServiceDetail: { serviceId: string; serviceName: string };
};

export type RootTabParamList = {
  Dashboard: undefined;
  Services: NavigatorScreenParams<ServicesStackParamList>;
  Map: undefined;
  Settings: undefined;
};

export type RootTabScreenProps<T extends keyof RootTabParamList> =
  BottomTabScreenProps<RootTabParamList, T>;

export type ServicesStackScreenProps<T extends keyof ServicesStackParamList> =
  CompositeScreenProps<
    NativeStackScreenProps<ServicesStackParamList, T>,
    BottomTabScreenProps<RootTabParamList>
  >;

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootTabParamList {}
  }
}

export interface Service {
  id: string;
  name: string;
  category: string;
  url: string;
  status: 'operational' | 'degraded' | 'outage' | 'unknown';
  confidence: number;
  lastChecked: string;
  regions: string[];
}

export interface Outage {
  id: string;
  serviceId: string;
  serviceName: string;
  status: 'outage' | 'degraded' | 'investigating';
  confidence: number;
  startedAt: string;
  resolvedAt: string | null;
  regions: string[];
  reportCount: number;
}

export interface Report {
  id: string;
  serviceId: string;
  type: 'outage' | 'degraded' | 'operational';
  description?: string;
  region?: string;
  createdAt: string;
}

export interface ProbeResult {
  region: string;
  status: 'up' | 'down' | 'degraded';
  latency: number;
  lastChecked: string;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  token: string;
}

export interface NotificationPreferences {
  outages: boolean;
  degraded: boolean;
  resolved: boolean;
  watchlistOnly: boolean;
}
