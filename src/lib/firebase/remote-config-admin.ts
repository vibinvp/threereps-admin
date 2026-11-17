import { getAdminRemoteConfig } from './admin';
import { RemoteConfigTemplate, RemoteConfigParameterValue } from 'firebase-admin/remote-config';

export type ManagedRemoteConfig = {
  app_update_enabled: boolean;
  force_update_enabled: boolean;
  android_min_version: string;
  android_latest_version: string;
  android_store_url: string;
  ios_min_version: string;
  ios_latest_version: string;
  ios_store_url: string;
  update_title: string;
  update_message: string;
  maintenance_mode: boolean;
  maintenance_title: string;
  maintenance_message: string;
  config_version: number;
  feature_new_booking_flow: boolean;
  feature_training_profile: boolean;
  feature_qr_attendance: boolean;
  feature_trial_booking: boolean;
  feature_subscription_booking: boolean;
};

export const MANAGED_KEYS: (keyof ManagedRemoteConfig)[] = [
  'app_update_enabled',
  'force_update_enabled',
  'android_min_version',
  'android_latest_version',
  'android_store_url',
  'ios_min_version',
  'ios_latest_version',
  'ios_store_url',
  'update_title',
  'update_message',
  'maintenance_mode',
  'maintenance_title',
  'maintenance_message',
  'config_version',
  'feature_new_booking_flow',
  'feature_training_profile',
  'feature_qr_attendance',
  'feature_trial_booking',
  'feature_subscription_booking',
];

export async function getRemoteConfigTemplate(): Promise<RemoteConfigTemplate> {
  return await getAdminRemoteConfig().getTemplate();
}

export function parseManagedConfig(template: RemoteConfigTemplate): ManagedRemoteConfig {
  const params = template.parameters;
  const config: Partial<ManagedRemoteConfig> = {};

  const getBoolean = (key: string, defaultVal: boolean): boolean => {
    if (!params[key] || !params[key].defaultValue) return defaultVal;
    const val = (params[key].defaultValue as any).value;
    return val === 'true';
  };

  const getString = (key: string, defaultVal: string): string => {
    if (!params[key] || !params[key].defaultValue) return defaultVal;
    return (params[key].defaultValue as any).value || defaultVal;
  };

  const getNumber = (key: string, defaultVal: number): number => {
    if (!params[key] || !params[key].defaultValue) return defaultVal;
    const val = (params[key].defaultValue as any).value;
    return val ? parseInt(val, 10) : defaultVal;
  };

  return {
    app_update_enabled: getBoolean('app_update_enabled', false),
    force_update_enabled: getBoolean('force_update_enabled', false),
    android_min_version: getString('android_min_version', ''),
    android_latest_version: getString('android_latest_version', ''),
    android_store_url: getString('android_store_url', ''),
    ios_min_version: getString('ios_min_version', ''),
    ios_latest_version: getString('ios_latest_version', ''),
    ios_store_url: getString('ios_store_url', ''),
    update_title: getString('update_title', 'Update Available'),
    update_message: getString('update_message', 'Please update the app to continue.'),
    maintenance_mode: getBoolean('maintenance_mode', false),
    maintenance_title: getString('maintenance_title', 'Scheduled Maintenance'),
    maintenance_message: getString('maintenance_message', "We'll be back shortly."),
    config_version: getNumber('config_version', 1),
    feature_new_booking_flow: getBoolean('feature_new_booking_flow', false),
    feature_training_profile: getBoolean('feature_training_profile', false),
    feature_qr_attendance: getBoolean('feature_qr_attendance', false),
    feature_trial_booking: getBoolean('feature_trial_booking', false),
    feature_subscription_booking: getBoolean('feature_subscription_booking', false),
  };
}

export async function publishManagedConfig(
  newValues: ManagedRemoteConfig,
  currentETag: string
): Promise<{ success: boolean; error?: string; template?: RemoteConfigTemplate }> {
  try {
    // 1. Fetch current template with ETag protection
    const currentTemplate = await getRemoteConfigTemplate();

    if (currentTemplate.etag !== currentETag) {
      return { success: false, error: 'The configuration changed elsewhere. Reload the current configuration before publishing.' };
    }

    // 2. Modify only managed parameters
    for (const key of MANAGED_KEYS) {
      const val = newValues[key];
      
      let stringValue = '';
      if (typeof val === 'boolean') {
        stringValue = val ? 'true' : 'false';
      } else if (typeof val === 'number') {
        stringValue = val.toString();
      } else {
        stringValue = val;
      }

      currentTemplate.parameters[key] = {
        defaultValue: { value: stringValue },
        valueType: typeof val === 'boolean' ? 'BOOLEAN' : typeof val === 'number' ? 'NUMBER' : 'STRING'
      };
    }

    // 3. Publish the template
    const publishedTemplate = await getAdminRemoteConfig().publishTemplate(currentTemplate);
    
    return { success: true, template: publishedTemplate };
  } catch (error: any) {
    console.error('Error publishing remote config', error);
    return { success: false, error: 'Unable to publish configuration. No changes were applied.' };
  }
}
