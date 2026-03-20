import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  TextInput,
  Alert,
  StyleSheet,
  Linking,
} from 'react-native';
import Constants from 'expo-constants';
import { useAppStore } from '../lib/store';
import type { RootTabScreenProps } from '../navigation/types';

export function SettingsScreen(
  _props: RootTabScreenProps<'Settings'>,
): React.JSX.Element {
  const {
    user,
    isAuthenticated,
    notificationPreferences,
    theme,
    watchlist,
    services,
    login,
    logout,
    updateNotificationPreferences,
    setTheme,
    toggleWatchlist,
  } = useAppStore();

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  const appVersion = Constants.expoConfig?.version ?? '0.1.0';

  const handleLogin = async () => {
    if (!loginEmail.trim() || !loginPassword.trim()) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }

    setLoggingIn(true);
    try {
      await login(loginEmail, loginPassword);
      setShowLogin(false);
      setLoginEmail('');
      setLoginPassword('');
    } catch {
      Alert.alert('Login Failed', 'Invalid email or password');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: () => logout(),
      },
    ]);
  };

  const watchedServices = services.filter((s) => watchlist.includes(s.id));

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.title}>Settings</Text>

      {/* Profile Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Profile</Text>
        <View style={styles.card}>
          {isAuthenticated && user ? (
            <>
              <View style={styles.profileRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {user.displayName
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .toUpperCase()
                      .slice(0, 2)}
                  </Text>
                </View>
                <View style={styles.profileInfo}>
                  <Text style={styles.profileName}>{user.displayName}</Text>
                  <Text style={styles.profileEmail}>{user.email}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.logoutButton}
                onPress={handleLogout}
              >
                <Text style={styles.logoutButtonText}>Log Out</Text>
              </TouchableOpacity>
            </>
          ) : showLogin ? (
            <View style={styles.loginForm}>
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor="#9CA3AF"
                value={loginEmail}
                onChangeText={setLoginEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#9CA3AF"
                value={loginPassword}
                onChangeText={setLoginPassword}
                secureTextEntry
                autoComplete="password"
              />
              <View style={styles.loginActions}>
                <TouchableOpacity
                  style={styles.loginButton}
                  onPress={handleLogin}
                  disabled={loggingIn}
                >
                  <Text style={styles.loginButtonText}>
                    {loggingIn ? 'Signing in...' : 'Sign In'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setShowLogin(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.loginButton}
              onPress={() => setShowLogin(true)}
            >
              <Text style={styles.loginButtonText}>Sign In</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Notification Preferences */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notifications</Text>
        <View style={styles.card}>
          <ToggleRow
            label="Outage alerts"
            description="Get notified when an outage is detected"
            value={notificationPreferences.outages}
            onToggle={(val) =>
              updateNotificationPreferences({ outages: val })
            }
          />
          <View style={styles.divider} />
          <ToggleRow
            label="Degraded performance"
            description="Get notified about degraded services"
            value={notificationPreferences.degraded}
            onToggle={(val) =>
              updateNotificationPreferences({ degraded: val })
            }
          />
          <View style={styles.divider} />
          <ToggleRow
            label="Resolved notifications"
            description="Get notified when outages are resolved"
            value={notificationPreferences.resolved}
            onToggle={(val) =>
              updateNotificationPreferences({ resolved: val })
            }
          />
          <View style={styles.divider} />
          <ToggleRow
            label="Watchlist only"
            description="Only notify for watched services"
            value={notificationPreferences.watchlistOnly}
            onToggle={(val) =>
              updateNotificationPreferences({ watchlistOnly: val })
            }
          />
        </View>
      </View>

      {/* Watchlist */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Service Watchlist ({watchedServices.length})
        </Text>
        <View style={styles.card}>
          {watchedServices.length === 0 ? (
            <Text style={styles.emptyWatchlist}>
              No services in your watchlist. Tap a service to add it.
            </Text>
          ) : (
            watchedServices.map((service, index) => (
              <React.Fragment key={service.id}>
                {index > 0 && <View style={styles.divider} />}
                <View style={styles.watchlistItem}>
                  <View>
                    <Text style={styles.watchlistName}>{service.name}</Text>
                    <Text style={styles.watchlistCategory}>
                      {service.category}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => toggleWatchlist(service.id)}
                  >
                    <Text style={styles.removeButtonText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </React.Fragment>
            ))
          )}
        </View>
      </View>

      {/* Theme */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Appearance</Text>
        <View style={styles.card}>
          <View style={styles.themeRow}>
            {(['light', 'dark', 'auto'] as const).map((t) => (
              <TouchableOpacity
                key={t}
                style={[
                  styles.themeOption,
                  theme === t && styles.themeOptionActive,
                ]}
                onPress={() => setTheme(t)}
              >
                <Text
                  style={[
                    styles.themeOptionText,
                    theme === t && styles.themeOptionTextActive,
                  ]}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* App Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Version</Text>
            <Text style={styles.infoValue}>{appVersion}</Text>
          </View>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.infoRow}
            onPress={() =>
              Linking.openURL('https://github.com/openpulse/openpulse')
            }
          >
            <Text style={styles.infoLabel}>GitHub</Text>
            <Text style={styles.infoLink}>View Repository</Text>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.infoRow}
            onPress={() =>
              Linking.openURL('https://api.openpulse.dev/docs')
            }
          >
            <Text style={styles.infoLabel}>API Documentation</Text>
            <Text style={styles.infoLink}>Open Docs</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.footer} />
    </ScrollView>
  );
}

interface ToggleRowProps {
  label: string;
  description: string;
  value: boolean;
  onToggle: (value: boolean) => void;
}

function ToggleRow({
  label,
  description,
  value,
  onToggle,
}: ToggleRowProps): React.JSX.Element {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleInfo}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleDescription}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
        thumbColor={value ? '#3B82F6' : '#F9FAFB'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    paddingBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  section: {
    marginTop: 16,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  profileEmail: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  logoutButton: {
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#DC2626',
    fontWeight: '600',
    fontSize: 14,
  },
  loginForm: {
    gap: 12,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  loginActions: {
    flexDirection: 'row',
    gap: 8,
  },
  loginButton: {
    flex: 1,
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#374151',
    fontWeight: '600',
    fontSize: 14,
  },
  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginVertical: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleInfo: {
    flex: 1,
    marginRight: 12,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#111827',
  },
  toggleDescription: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  emptyWatchlist: {
    color: '#9CA3AF',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 8,
  },
  watchlistItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  watchlistName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#111827',
  },
  watchlistCategory: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  removeButton: {
    backgroundColor: '#FEF2F2',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  removeButtonText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '600',
  },
  themeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  themeOption: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  themeOptionActive: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
  },
  themeOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  themeOptionTextActive: {
    color: '#3B82F6',
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  infoLabel: {
    fontSize: 15,
    color: '#374151',
  },
  infoValue: {
    fontSize: 14,
    color: '#6B7280',
  },
  infoLink: {
    fontSize: 14,
    color: '#3B82F6',
    fontWeight: '500',
  },
  footer: {
    height: 32,
  },
});
