"use client";

import { useState, useRef } from 'react';
import { storage } from '@/lib/firebase/config';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useFirestoreMutation } from '@/lib/hooks/useFirestoreMutation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Upload, Trash2, Image as ImageIcon, Eye } from 'lucide-react';
import Image from 'next/image';

interface ProfileImageEditorProps {
  trainerId: string;
  currentPhotoUrl?: string | null;
}

export function ProfileImageEditor({ trainerId, currentPhotoUrl }: ProfileImageEditorProps) {
  const { update } = useFirestoreMutation('trainers');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Invalid image format. Supported formats: JPG, PNG, WEBP');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size must be less than 5MB');
      return;
    }

    try {
      setIsUploading(true);
      const timestamp = Date.now();
      const storageRef = ref(storage, `trainers/${trainerId}/profile/${timestamp}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      // Update Firestore
      await update.mutateAsync({ id: trainerId, photoUrl: url, updatedAt: new Date() });
      toast.success('Profile photo updated successfully');

      // Attempt to delete old photo if exists and belongs to project storage
      if (currentPhotoUrl && currentPhotoUrl.includes('firebasestorage.googleapis.com')) {
        try {
          const oldRef = ref(storage, currentPhotoUrl);
          await deleteObject(oldRef);
        } catch (err) {
          console.error("Failed to delete old photo", err);
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete trainer profile photo?")) return;
    
    try {
      setIsUploading(true);
      
      // Update Firestore
      await update.mutateAsync({ id: trainerId, photoUrl: null, updatedAt: new Date() });
      toast.success('Profile photo deleted');
      
      // Attempt to delete from storage first if valid project URL
      if (currentPhotoUrl && currentPhotoUrl.includes('firebasestorage.googleapis.com')) {
        try {
          const oldRef = ref(storage, currentPhotoUrl);
          await deleteObject(oldRef);
        } catch (err) {
          console.error("Failed to delete photo from storage", err);
        }
      }

    } catch (err: any) {
      toast.error(err.message || 'Delete failed');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-center sm:items-start gap-4">
      <div className="relative h-32 w-32 rounded-full overflow-hidden border-2 bg-muted flex items-center justify-center shrink-0">
        {currentPhotoUrl ? (
          <Image 
            src={currentPhotoUrl} 
            alt="Profile photo" 
            fill 
            className="object-cover"
            sizes="128px"
          />
        ) : (
          <ImageIcon className="h-12 w-12 text-muted-foreground/50" />
        )}
      </div>
      
      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
        <input 
          type="file"
          accept="image/jpeg, image/png, image/webp"
          className="hidden"
          ref={fileInputRef}
          onChange={handleUpload}
          disabled={isUploading}
        />
        <Button 
          type="button"
          variant="outline" 
          size="sm" 
          disabled={isUploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {isUploading ? "Uploading..." : "Change Photo"}
        </Button>
        {currentPhotoUrl && (
          <Button 
            type="button"
            variant="destructive" 
            size="sm"
            onClick={handleDelete}
            disabled={isUploading}
          >
            Delete Photo
          </Button>
        )}
      </div>
    </div>
  );
}

interface CertificatesEditorProps {
  trainerId: string;
  currentCertificates?: string[];
}

export function CertificatesEditor({ trainerId, currentCertificates = [] }: CertificatesEditorProps) {
  const { update } = useFirestoreMutation('trainers');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Invalid image format. Supported formats: JPG, PNG, WEBP');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB');
      return;
    }

    try {
      setIsUploading(true);
      const timestamp = Date.now();
      const storageRef = ref(storage, `trainers/${trainerId}/certificates/${timestamp}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      const updatedCerts = [...currentCertificates, url];

      // Update Firestore
      await update.mutateAsync({ id: trainerId, certificateUrls: updatedCerts, updatedAt: new Date() });
      toast.success('Certificate uploaded successfully');
    } catch (err: any) {
      toast.error(err.message || 'Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (certUrl: string) => {
    if (!window.confirm("Delete this certificate?")) return;
    
    try {
      setIsUploading(true);
      
      const updatedCerts = currentCertificates.filter(url => url !== certUrl);
      
      // Update Firestore
      await update.mutateAsync({ id: trainerId, certificateUrls: updatedCerts, updatedAt: new Date() });
      toast.success('Certificate deleted');
      
      // Attempt to delete from storage if valid project URL
      if (certUrl.includes('firebasestorage.googleapis.com')) {
        try {
          const oldRef = ref(storage, certUrl);
          await deleteObject(oldRef);
        } catch (err) {
          console.error("Failed to delete certificate from storage", err);
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Delete failed');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {currentCertificates.map((certUrl, idx) => (
          <Card key={idx} className="overflow-hidden group relative aspect-[4/3] bg-muted flex items-center justify-center border">
            <Image 
              src={certUrl}
              alt={`Certificate ${idx + 1}`}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 50vw, 25vw"
            />
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <a 
                href={certUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="bg-secondary text-secondary-foreground hover:bg-secondary/80 p-2 rounded-md transition-colors"
                title="View Certificate"
              >
                <Eye className="h-4 w-4" />
              </a>
              <button
                type="button"
                onClick={() => handleDelete(certUrl)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 p-2 rounded-md transition-colors"
                title="Delete Certificate"
                disabled={isUploading}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </Card>
        ))}

        <Card 
          className="border-dashed border-2 hover:bg-muted/50 transition-colors cursor-pointer flex flex-col items-center justify-center min-h-[120px] aspect-[4/3] text-muted-foreground gap-2" 
          onClick={() => !isUploading && fileInputRef.current?.click()}
        >
          {isUploading ? (
            <span className="text-sm font-medium">Uploading...</span>
          ) : (
            <>
              <Upload className="h-6 w-6" />
              <span className="text-sm font-medium">Add Certificate</span>
            </>
          )}
        </Card>
      </div>
      
      <input 
        type="file"
        accept="image/jpeg, image/png, image/webp"
        className="hidden"
        ref={fileInputRef}
        onChange={handleUpload}
        disabled={isUploading}
      />
    </div>
  );
}
