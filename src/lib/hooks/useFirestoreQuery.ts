import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import {
  collection,
  query,
  getDocs,
  getCountFromServer,
  getAggregateFromServer,
  sum,
  QueryConstraint,
  DocumentData,
  Query,
  where,
  limit
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

// Safety ceiling applied when a caller doesn't specify its own `limit()` -
// prevents admin list pages from pulling an entire collection as it grows.
const DEFAULT_QUERY_LIMIT = 200;

export function useFirestoreQuery<T = DocumentData>(
  queryKey: string[],
  collectionName: string,
  constraints?: QueryConstraint[],
  options?: Omit<UseQueryOptions<T[], Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery<T[], Error>({
    queryKey,
    queryFn: async () => {
      const colRef = collection(db, collectionName);
      const hasLimit = constraints?.some((c) => c.type === 'limit') ?? false;
      const effectiveConstraints: QueryConstraint[] = hasLimit
        ? constraints!
        : [...(constraints ?? []), limit(DEFAULT_QUERY_LIMIT)];
      const q: Query = query(colRef, ...effectiveConstraints);
      const snapshot = await getDocs(q);
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as T[];
    },
    ...options
  });
}

// Server-side count — avoids downloading full documents just to show a number.
export function useFirestoreCount(
  queryKey: string[],
  collectionName: string,
  constraints?: QueryConstraint[],
  options?: Omit<UseQueryOptions<number, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery<number, Error>({
    queryKey,
    queryFn: async () => {
      const colRef = collection(db, collectionName);
      const q: Query = constraints?.length ? query(colRef, ...constraints) : query(colRef);
      const snapshot = await getCountFromServer(q);
      return snapshot.data().count;
    },
    ...options
  });
}

// Server-side sum — avoids downloading full documents just to total a field.
export function useFirestoreSum(
  queryKey: string[],
  collectionName: string,
  field: string,
  constraints?: QueryConstraint[],
  options?: Omit<UseQueryOptions<number, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery<number, Error>({
    queryKey,
    queryFn: async () => {
      const colRef = collection(db, collectionName);
      const q: Query = constraints?.length ? query(colRef, ...constraints) : query(colRef);
      const snapshot = await getAggregateFromServer(q, { total: sum(field) });
      return snapshot.data().total;
    },
    ...options
  });
}
