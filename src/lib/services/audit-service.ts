import { getAdminDb } from '../firebase/admin';

export type AppConfigAuditLog = {
  adminId: string;
  adminName: string;
  action: string;
  changedAt: string; // ISO string
  configVersion: number;
  changes: Record<string, { from: any; to: any }>;
};

export async function logAppConfigChange(auditData: AppConfigAuditLog): Promise<void> {
  try {
    const auditRef = getAdminDb().collection('app_config_audit').doc();
    await auditRef.set({
      ...auditData,
      changedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Failed to write audit log', error);
  }
}
