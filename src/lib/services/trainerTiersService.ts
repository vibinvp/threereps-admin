import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  orderBy,
  where,
  writeBatch,
  serverTimestamp,
  getCountFromServer,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { TrainerTier } from "@/types";

const COLLECTION_NAME = "trainer_tiers";

export const trainerTiersService = {
  // Fetch all tiers ordered by position
  async getAllTiers(): Promise<TrainerTier[]> {
    const q = query(
      collection(db, COLLECTION_NAME),
      orderBy("position", "asc")
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(
      (doc) =>
        ({
          id: doc.id,
          ...doc.data(),
        } as TrainerTier)
    );
  },

  // Fetch a single tier by ID
  async getTierById(id: string): Promise<TrainerTier | null> {
    const docRef = doc(db, COLLECTION_NAME, id);
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) return null;
    return { id: snapshot.id, ...snapshot.data() } as TrainerTier;
  },

  // Create a new tier
  async createTier(
    data: Omit<TrainerTier, "id">,
    uid: string
  ): Promise<string> {
    const newDocRef = doc(collection(db, COLLECTION_NAME));
    await setDoc(newDocRef, {
      ...data,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    });
    return newDocRef.id;
  },

  // Update an existing tier
  async updateTier(
    id: string,
    data: Partial<TrainerTier>,
    uid: string
  ): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(docRef, {
      ...data,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    });
  },

  // Update the position of multiple tiers in a batch
  async reorderTiers(tiers: TrainerTier[], uid: string): Promise<void> {
    const batch = writeBatch(db);
    tiers.forEach((tier, index) => {
      if (!tier.id) return;
      const docRef = doc(db, COLLECTION_NAME, tier.id);
      batch.update(docRef, {
        position: index + 1, // Positions might be 1-indexed
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      });
    });
    await batch.commit();
  },

  // Check if a tier is used by any trainers
  async isTierAssignedToTrainers(tierId: string): Promise<number> {
    const q = query(
      collection(db, "trainers"),
      where("tier", "==", tierId)
    );
    const snapshot = await getCountFromServer(q);
    return snapshot.data().count;
  },

  // Disable a tier (instead of deleting)
  async disableTier(id: string, uid: string): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(docRef, {
      isActive: false,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    });
  },

  // Seed default tiers for Gold, Platinum, Diamond
  async seedDefaultTiers(uid: string = 'admin'): Promise<void> {
    const createSubPlans = (basePrice: number) => ({
      mon_wed_fri: [
        { title: '1 Month', durationType: 'months', durationValue: 1, price: basePrice, active: true, popular: false, sortOrder: 1 },
        { title: '3 Months', durationType: 'months', durationValue: 3, price: basePrice * 2.8, active: true, popular: true, sortOrder: 2 },
        { title: '6 Months', durationType: 'months', durationValue: 6, price: basePrice * 5, active: true, popular: false, sortOrder: 3 },
      ],
      tue_thu_sat: [
        { title: '1 Month', durationType: 'months', durationValue: 1, price: basePrice, active: true, popular: false, sortOrder: 1 },
        { title: '3 Months', durationType: 'months', durationValue: 3, price: basePrice * 2.8, active: true, popular: true, sortOrder: 2 },
        { title: '6 Months', durationType: 'months', durationValue: 6, price: basePrice * 5, active: true, popular: false, sortOrder: 3 },
      ],
      mon_sat: [
        { title: '1 Month', durationType: 'months', durationValue: 1, price: basePrice * 1.8, active: true, popular: false, sortOrder: 1 },
        { title: '3 Months', durationType: 'months', durationValue: 3, price: basePrice * 1.8 * 2.8, active: true, popular: true, sortOrder: 2 },
        { title: '6 Months', durationType: 'months', durationValue: 6, price: basePrice * 1.8 * 5, active: true, popular: false, sortOrder: 3 },
      ]
    });

    const defaultTiers = [
      {
        name: 'Gold',
        position: 1,
        commissionRate: 30,
        isActive: true,
        badgeColor: '#D4AF37',
        badgeTextColor: '#111111',
        borderColor: '#D4AF37',
        gradientStart: '#F7DC6F',
        gradientEnd: '#B8860B',
        icon: 'workspace_premium',
        shortDescription: 'Our standard tier for excellent trainers.',
        pricing: {
          trial: {
            individual: { price: 99, active: true, popular: true, sortOrder: 1 },
            couple: { price: 149, active: true, popular: false, sortOrder: 2 }
          },
          subscriptions: {
            individual: createSubPlans(3999),
            couple: createSubPlans(5999)
          }
        }
      },
      {
        name: 'Platinum',
        position: 2,
        commissionRate: 25,
        isActive: true,
        badgeColor: '#E5E4E2',
        badgeTextColor: '#111111',
        borderColor: '#E5E4E2',
        gradientStart: '#FFFFFF',
        gradientEnd: '#CCCCCC',
        icon: 'stars',
        shortDescription: 'Premium trainers with advanced experience.',
        pricing: {
          trial: {
            individual: { price: 199, active: true, popular: false, sortOrder: 1 },
            couple: { price: 299, active: true, popular: true, sortOrder: 2 }
          },
          subscriptions: {
            individual: createSubPlans(5999),
            couple: createSubPlans(8999)
          }
        }
      },
      {
        name: 'Diamond',
        position: 3,
        commissionRate: 20,
        isActive: true,
        badgeColor: '#B9F2FF',
        badgeTextColor: '#111111',
        borderColor: '#B9F2FF',
        gradientStart: '#E0FFFF',
        gradientEnd: '#87CEFA',
        icon: 'diamond',
        shortDescription: 'Elite trainers offering the highest level of service.',
        pricing: {
          trial: {
            individual: { price: 299, active: true, popular: false, sortOrder: 1 },
            couple: { price: 449, active: true, popular: false, sortOrder: 2 }
          },
          subscriptions: {
            individual: createSubPlans(7999),
            couple: createSubPlans(11999)
          }
        }
      }
    ];

    const batch = writeBatch(db);
    defaultTiers.forEach((tier) => {
      const newDocRef = doc(collection(db, COLLECTION_NAME));
      batch.set(newDocRef, {
        ...tier,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      });
    });

    await batch.commit();
  },

};
