"use client";

import { useState, useEffect } from "react";
import { useFirestoreQuery } from "@/lib/hooks/useFirestoreQuery";
import { useFirestoreMutation } from "@/lib/hooks/useFirestoreMutation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Save } from "lucide-react";

interface LegalContent {
  id: string; // "tos", "privacy", or "about"
  body: string;
  lastUpdated?: any;
}

export default function LegalPage() {
  const [activeTab, setActiveTab] = useState<string>("tos");
  const [content, setContent] = useState<string>("");

  const { data: legalDocs, isLoading } = useFirestoreQuery<LegalContent>(['legal_content'], 'legal_content');
  const { update } = useFirestoreMutation('legal_content');

  useEffect(() => {
    if (legalDocs) {
      const activeDoc = legalDocs.find(doc => doc.id === activeTab);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync editor with fetched doc
      setContent(activeDoc?.body || "");
    }
  }, [activeTab, legalDocs]);

  const wordCount = content.trim().split(/\s+/).filter(w => w.length > 0).length;

  const handleSave = async () => {
    try {
      await update.mutateAsync({ 
        id: activeTab, 
        body: content 
      });
      toast.success("Content published successfully");
    } catch (error) {
      toast.error("Failed to publish content");
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Legal & Policy Editor</h1>
        <p className="text-muted-foreground">Manage Terms of Service, Privacy Policy, and About Us content.</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="tos">Terms of Service</TabsTrigger>
          <TabsTrigger value="privacy">Privacy Policy</TabsTrigger>
          <TabsTrigger value="about">About Us</TabsTrigger>
        </TabsList>
        
        <div className="mt-6">
          {isLoading ? (
            <Skeleton className="w-full h-[500px] rounded-md" />
          ) : (
            <div className="space-y-4">
              <div className="relative">
                <Textarea 
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Enter markdown content here..."
                  className="min-h-[500px] font-mono resize-y"
                />
                <div className="absolute bottom-4 right-4 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded backdrop-blur-sm pointer-events-none">
                  {wordCount} words
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSave} className="w-full sm:w-auto">
                  <Save className="mr-2 h-4 w-4" /> Publish Changes
                </Button>
              </div>
            </div>
          )}
        </div>
      </Tabs>
    </div>
  );
}
