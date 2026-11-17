"use client";

import { useState } from "react";
import { useFirestoreQuery } from "@/lib/hooks/useFirestoreQuery";
import { useFirestoreMutation } from "@/lib/hooks/useFirestoreMutation";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Plus, Edit2, Trash2 } from "lucide-react";

interface FAQ {
  id: string;
  question: string;
  answer: string;
  order: number;
}

const faqSchema = z.object({
  question: z.string().min(1, "Question is required"),
  answer: z.string().min(1, "Answer is required"),
  order: z.coerce.number().int().default(0),
});

type FAQFormValues = z.infer<typeof faqSchema>;

export default function CMSPage() {
  const { data: faqs, isLoading } = useFirestoreQuery<FAQ>(['cms'], 'cms');
  const { add, update, remove } = useFirestoreMutation('cms');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFAQ, setEditingFAQ] = useState<FAQ | null>(null);

  const form = useForm<FAQFormValues>({
    resolver: zodResolver(faqSchema) as any,
    defaultValues: {
      question: "",
      answer: "",
      order: 0,
    },
  });

  const handleOpenModal = (faq?: FAQ) => {
    if (faq) {
      setEditingFAQ(faq);
      form.reset({
        question: faq.question,
        answer: faq.answer,
        order: faq.order,
      });
    } else {
      setEditingFAQ(null);
      form.reset({
        question: "",
        answer: "",
        order: faqs ? faqs.length : 0,
      });
    }
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this FAQ?")) {
      try {
        await remove.mutateAsync({ id, soft: false });
        toast.success("FAQ deleted successfully");
      } catch (error) {
        toast.error("Failed to delete FAQ");
      }
    }
  };

  const onSubmit = async (data: any) => {
    try {
      if (editingFAQ) {
        await update.mutateAsync({ id: editingFAQ.id, ...data });
        toast.success("FAQ updated successfully");
      } else {
        await add.mutateAsync(data);
        toast.success("FAQ created successfully");
      }
      setIsModalOpen(false);
    } catch (error) {
      toast.error("Failed to save FAQ");
    }
  };

  const sortedFaqs = faqs?.slice().sort((a, b) => a.order - b.order) || [];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">CMS & FAQ Manager</h1>
          <p className="text-muted-foreground">Manage frequently asked questions and app content.</p>
        </div>
        <Button onClick={() => handleOpenModal()}>
          <Plus className="mr-2 h-4 w-4" /> Add FAQ
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <Accordion>
          {sortedFaqs.map((faq) => (
            <AccordionItem key={faq.id} value={faq.id}>
              <AccordionTrigger className="hover:no-underline flex justify-between pr-4 group">
                <span className="text-left font-medium">{faq.question}</span>
                <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity mr-4">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); handleOpenModal(faq); }}>
                    <Edit2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={(e) => handleDelete(faq.id, e)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground whitespace-pre-wrap">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
          {sortedFaqs.length === 0 && (
            <div className="text-center py-12 text-muted-foreground border border-dashed rounded-lg">
              No FAQs available. Click "Add FAQ" to create one.
            </div>
          )}
        </Accordion>
      )}

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{editingFAQ ? 'Edit FAQ' : 'Add New FAQ'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="question">Question</Label>
              <Input id="question" {...form.register("question")} />
              {form.formState.errors.question && (
                <p className="text-xs text-destructive">{form.formState.errors.question.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="answer">Answer</Label>
              <Textarea id="answer" {...form.register("answer")} className="min-h-[150px]" />
              {form.formState.errors.answer && (
                <p className="text-xs text-destructive">{form.formState.errors.answer.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="order">Display Order</Label>
              <Input id="order" type="number" {...form.register("order")} />
              {form.formState.errors.order && (
                <p className="text-xs text-destructive">{form.formState.errors.order.message}</p>
              )}
            </div>

            <div className="flex justify-end pt-4">
              <Button type="button" variant="outline" className="mr-2" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Saving...' : 'Save FAQ'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
