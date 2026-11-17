import { db } from '../firebase/config';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { taxConfigSchema } from '../validations';
import { z } from 'zod';

export type TaxConfig = z.infer<typeof taxConfigSchema>;

const DOC_PATH = ['app_config', 'tax'] as const;

export const taxConfigService = {
  async get(): Promise<TaxConfig> {
    const snap = await getDoc(doc(db, ...DOC_PATH));
    if (!snap.exists()) {
      return { gstPercentage: 0 };
    }
    return snap.data() as TaxConfig;
  },

  async set(gstPercentage: number, updatedBy: string): Promise<void> {
    const validated = taxConfigSchema.parse({ gstPercentage });
    await setDoc(doc(db, ...DOC_PATH), {
      gstPercentage: validated.gstPercentage,
      updatedAt: serverTimestamp(),
      updatedBy,
    });
  },
};
