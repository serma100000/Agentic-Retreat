import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.warn('Push notifications require a physical device');
    return null;
  }

  const { status: existingStatus } =
    await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('Push notification permission not granted');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#3B82F6',
    });

    await Notifications.setNotificationChannelAsync('outages', {
      name: 'Outage Alerts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 250, 500],
      lightColor: '#EF4444',
    });
  }

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: projectId ?? undefined,
    });
    return tokenData.data;
  } catch (error) {
    console.error('Failed to get push token:', error);
    return null;
  }
}

export function handleNotification(
  notification: Notifications.Notification,
): void {
  const data = notification.request.content.data;

  if (!data) return;

  switch (data.type) {
    case 'outage_detected':
      console.log('Outage detected:', data.serviceId, data.serviceName);
      break;
    case 'outage_resolved':
      console.log('Outage resolved:', data.serviceId, data.serviceName);
      break;
    case 'degraded_performance':
      console.log('Degraded performance:', data.serviceId, data.serviceName);
      break;
    default:
      console.log('Unknown notification type:', data.type);
  }
}

export interface NotificationResponse {
  serviceId?: string;
  outageId?: string;
  type?: string;
}

export function parseNotificationResponse(
  response: Notifications.NotificationResponse,
): NotificationResponse {
  const data = response.notification.request.content.data;
  return {
    serviceId: data?.serviceId as string | undefined,
    outageId: data?.outageId as string | undefined,
    type: data?.type as string | undefined,
  };
}

export function setupNotificationListeners(): () => void {
  const receivedSubscription =
    Notifications.addNotificationReceivedListener((notification) => {
      handleNotification(notification);
    });

  const responseSubscription =
    Notifications.addNotificationResponseReceivedListener((response) => {
      const parsed = parseNotificationResponse(response);
      console.log('Notification tapped:', parsed);
      // Navigation can be handled by the component that calls this
    });

  return () => {
    receivedSubscription.remove();
    responseSubscription.remove();
  };
}
