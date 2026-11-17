import { useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  DocumentData,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

interface MutationData {
  id?: string;
  [key: string]: any;
}

interface MutationContext {
  previousData: any;
}

export function useFirestoreMutation(collectionName: string) {
  const queryClient = useQueryClient();

  // Add document
  const add = useMutation({
    mutationFn: async (data: Omit<MutationData, 'id'>) => {
      const colRef = collection(db, collectionName);
      const docRef = await addDoc(colRef, {
        ...data,
        createdAt: serverTimestamp(),
      });
      return { id: docRef.id, ...data };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [collectionName] });
    },
  });

  // Update document
  const update = useMutation({
    mutationFn: async ({ id, ...data }: MutationData) => {
      if (!id) throw new Error('Document ID is required for update');
      const docRef = doc(db, collectionName, id);
      await updateDoc(docRef, data);
      return { id, ...data };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [collectionName] });
    },
  });

  // Soft delete document (or hard delete if specified)
  const remove = useMutation({
    mutationFn: async ({ id, soft = true }: { id: string; soft?: boolean }) => {
      const docRef = doc(db, collectionName, id);
      if (soft) {
        await updateDoc(docRef, {
          isDeleted: true,
          deletedAt: serverTimestamp(),
        });
      } else {
        await deleteDoc(docRef);
      }
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [collectionName] });
    },
  });

  return { add, update, remove };
}
