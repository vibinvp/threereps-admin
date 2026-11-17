import { db } from '../firebase/config';
import { collection, getDocs, query, orderBy, doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { sessionPatternSchema } from '../validations';
import { z } from 'zod';

export type SessionPattern = z.infer<typeof sessionPatternSchema>;

const COLLECTION_NAME = 'session_patterns';

export const sessionPatternsService = {
  async getAll(): Promise<SessionPattern[]> {
    const q = query(collection(db, COLLECTION_NAME), orderBy('sortOrder', 'asc'));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data
      } as SessionPattern;
    });
  },

  async getById(id: string): Promise<SessionPattern | null> {
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as SessionPattern;
    }
    return null;
  },

  async create(data: SessionPattern): Promise<SessionPattern> {
    const docRef = doc(collection(db, COLLECTION_NAME));
    const validatedData = sessionPatternSchema.parse(data);
    const { id, ...dataToSave } = validatedData;
    
    await setDoc(docRef, dataToSave);
    return { ...data, id: docRef.id };
  },

  async update(id: string, data: Partial<SessionPattern>): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(docRef, data);
  },

  async delete(id: string): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    await deleteDoc(docRef);
  },
  
  async seedDefaultPatterns(): Promise<void> {
    const defaults = [
      { id: 'mon_wed_fri', displayName: 'Mon-Wed-Fri', daysPerWeek: 3, sortOrder: 1, isActive: true },
      { id: 'tue_thu_sat', displayName: 'Tue-Thu-Sat', daysPerWeek: 3, sortOrder: 2, isActive: true },
      { id: 'mon_sat', displayName: 'Mon-Sat', daysPerWeek: 6, sortOrder: 3, isActive: true },
    ];
    
    for (const pattern of defaults) {
      const docRef = doc(db, COLLECTION_NAME, pattern.id);
      const { id, ...data } = pattern;
      await setDoc(docRef, data, { merge: true });
    }
  }
};
