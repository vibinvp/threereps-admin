import { NextRequest, NextResponse } from 'next/server';
import { getAdminRemoteConfig } from '@/lib/firebase/admin';
import { authenticateAdmin } from '@/lib/firebase/admin-auth';

export async function GET(req: NextRequest) {
  const authResult = await authenticateAdmin(req);
  if (authResult.error) {
    return NextResponse.json({ success: false, error: authResult.error }, { status: 403 });
  }
  try {
    const remoteConfig = getAdminRemoteConfig();
    const template = await remoteConfig.getTemplate();
    
    // We can just return all parameters, or filter to only send what the admin needs.
    // Since admin needs to see the current values, we return the template parameters.
    const params = template.parameters;
    
    return NextResponse.json({ success: true, parameters: params });
  } catch (error: any) {
    console.error('Error fetching remote config:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authResult = await authenticateAdmin(req);
  if (authResult.error) {
    return NextResponse.json({ success: false, error: authResult.error }, { status: 403 });
  }
  try {
    const body = await req.json();
    
    // The expected body is the updated trainer parameters
    const { updates } = body; 
    // updates should be an object like: { trainer_maintenance_mode: { defaultValue: { value: 'true' } }, ... }

    const remoteConfig = getAdminRemoteConfig();
    
    // 1. Fetch current template
    const template = await remoteConfig.getTemplate();
    
    // 2. Preserve existing parameters and only update the trainer_ ones
    const currentParams = template.parameters;
    
    for (const [key, paramValue] of Object.entries(updates)) {
      if (key.startsWith('trainer_')) {
        currentParams[key] = paramValue as any;
      }
    }
    
    // 3. Publish the updated template
    template.parameters = currentParams;
    const updatedTemplate = await remoteConfig.publishTemplate(template);
    
    return NextResponse.json({ success: true, template: updatedTemplate });
  } catch (error: any) {
    console.error('Error updating remote config:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
