import { NextResponse } from 'next/server';
import { authenticateAdmin } from '@/lib/firebase/admin-auth';
import { getRemoteConfigTemplate, parseManagedConfig, publishManagedConfig, ManagedRemoteConfig } from '@/lib/firebase/remote-config-admin';
import { logAppConfigChange } from '@/lib/services/audit-service';

function compareVersions(v1: string, v2: string): number {
  const p1 = v1.split('.').map(Number);
  const p2 = v2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const n1 = p1[i] || 0;
    const n2 = p2[i] || 0;
    if (n1 > n2) return 1;
    if (n1 < n2) return -1;
  }
  return 0;
}

function isValidVersion(version: string): boolean {
  return /^[0-9]+\.[0-9]+\.[0-9]+$/.test(version);
}

export async function GET(request: Request) {
  const authResult = await authenticateAdmin(request);
  if (authResult.error) {
    return NextResponse.json({ error: authResult.error }, { status: 403 });
  }

  try {
    const template = await getRemoteConfigTemplate();
    const managedConfig = parseManagedConfig(template);
    return NextResponse.json({ config: managedConfig, etag: template.etag });
  } catch (error: any) {
    console.error('Error fetching remote config:', error);
    return NextResponse.json({ error: 'Failed to fetch configuration.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authResult = await authenticateAdmin(request);
  if (authResult.error) {
    return NextResponse.json({ error: authResult.error }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { newConfig, currentETag } = body as { newConfig: ManagedRemoteConfig, currentETag: string };

    if (!newConfig || !currentETag) {
      return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
    }

    // Validation
    if (newConfig.android_min_version && !isValidVersion(newConfig.android_min_version)) {
      return NextResponse.json({ error: 'Enter a valid version such as 1.2.0 for Android minimum version.' }, { status: 400 });
    }
    if (newConfig.android_latest_version && !isValidVersion(newConfig.android_latest_version)) {
      return NextResponse.json({ error: 'Enter a valid version such as 1.2.0 for Android latest version.' }, { status: 400 });
    }
    if (newConfig.ios_min_version && !isValidVersion(newConfig.ios_min_version)) {
      return NextResponse.json({ error: 'Enter a valid version such as 1.2.0 for iOS minimum version.' }, { status: 400 });
    }
    if (newConfig.ios_latest_version && !isValidVersion(newConfig.ios_latest_version)) {
      return NextResponse.json({ error: 'Enter a valid version such as 1.2.0 for iOS latest version.' }, { status: 400 });
    }

    if (newConfig.android_min_version && newConfig.android_latest_version && 
        compareVersions(newConfig.android_min_version, newConfig.android_latest_version) > 0) {
      return NextResponse.json({ error: 'Minimum version cannot be higher than latest version for Android.' }, { status: 400 });
    }
    
    if (newConfig.ios_min_version && newConfig.ios_latest_version && 
        compareVersions(newConfig.ios_min_version, newConfig.ios_latest_version) > 0) {
      return NextResponse.json({ error: 'Minimum version cannot be higher than latest version for iOS.' }, { status: 400 });
    }

    // Get current to generate changes object for audit
    const currentTemplate = await getRemoteConfigTemplate();
    const currentConfig = parseManagedConfig(currentTemplate);
    
    const changes: Record<string, { from: any; to: any }> = {};
    for (const [key, val] of Object.entries(newConfig)) {
      const fromVal = (currentConfig as any)[key];
      if (fromVal !== val && key !== 'config_version') { // don't log config_version bump here yet
        changes[key] = { from: fromVal, to: val };
      }
    }

    // Only increment version if there are changes
    if (Object.keys(changes).length === 0) {
      return NextResponse.json({ message: 'No changes to publish', config: currentConfig, etag: currentTemplate.etag });
    }

    // Increment version
    newConfig.config_version = currentConfig.config_version + 1;
    
    const publishResult = await publishManagedConfig(newConfig, currentETag);
    
    if (!publishResult.success) {
      return NextResponse.json({ error: publishResult.error }, { status: 409 }); // 409 Conflict
    }

    // Log audit
    await logAppConfigChange({
      adminId: authResult.uid as string,
      adminName: (authResult.adminData as { email?: string })?.email || 'Unknown Admin',
      action: 'remote_config_update',
      changedAt: new Date().toISOString(),
      configVersion: newConfig.config_version,
      changes
    });

    const finalConfig = parseManagedConfig(publishResult.template!);

    return NextResponse.json({ 
      message: 'Configuration published successfully', 
      config: finalConfig, 
      etag: publishResult.template!.etag 
    });
  } catch (error: any) {
    console.error('Error in POST remote-config:', error);
    return NextResponse.json({ error: 'Unable to publish configuration. No changes were applied.' }, { status: 500 });
  }
}
