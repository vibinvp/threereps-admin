"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { toast } from "sonner";
import { Plus, Trash2, Download, Upload } from "lucide-react";
import { db, storage } from "@/lib/firebase/config";
import { useFirestoreQuery } from "@/lib/hooks/useFirestoreQuery";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Landing page content for the public website (3repsfitness.com).
 * Stored in ONE document, `landing_page/content`, which the website reads
 * through Firestore's public REST API. It is separate from every collection
 * the mobile apps use, so editing it can never affect the production apps.
 */
interface Service { name: string; description: string; imageUrl: string }
interface Faq { question: string; answer: string }
interface Testimonial { name: string; role: string; quote: string; photoUrl: string }
interface FeaturedTrainer {
  name: string; photoUrl: string; specialisations: string; languages: string; experience: string;
}
interface LandingContent {
  hero: { eyebrow: string; headline: string; subtext: string; primaryCta: string; secondaryCta: string };
  contact: { email: string; phone: string; whatsapp: string; address: string };
  appLinks: { ios: string; android: string };
  seo: { title: string; description: string; keywords: string };
  serviceAreas: string[];
  services: Service[];
  faqs: Faq[];
  testimonials: Testimonial[];
  featuredTrainers: FeaturedTrainer[];
}

const EMPTY: LandingContent = {
  hero: { eyebrow: "", headline: "", subtext: "", primaryCta: "", secondaryCta: "" },
  contact: { email: "", phone: "", whatsapp: "", address: "" },
  appLinks: { ios: "", android: "" },
  seo: { title: "", description: "", keywords: "" },
  serviceAreas: [],
  services: [],
  faqs: [],
  testimonials: [],
  featuredTrainers: [],
};

const splitList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

/** Converts the stored document (arrays for list fields) into editable form state. */
function fromDoc(d: Record<string, any>): LandingContent {
  return {
    hero: { ...EMPTY.hero, ...(d.hero ?? {}) },
    contact: { ...EMPTY.contact, ...(d.contact ?? {}) },
    appLinks: { ...EMPTY.appLinks, ...(d.appLinks ?? {}) },
    seo: {
      ...EMPTY.seo,
      ...(d.seo ?? {}),
      keywords: Array.isArray(d.seo?.keywords) ? d.seo.keywords.join(", ") : d.seo?.keywords ?? "",
    },
    serviceAreas: d.serviceAreas ?? [],
    services: (d.services ?? []).map((s: any) => ({ name: "", description: "", imageUrl: "", ...s })),
    faqs: d.faqs ?? [],
    testimonials: (d.testimonials ?? []).map((t: any) => ({ name: "", role: "", quote: "", photoUrl: "", ...t })),
    featuredTrainers: (d.featuredTrainers ?? []).map((t: any) => ({
      name: t.name ?? "",
      photoUrl: t.photoUrl ?? "",
      experience: t.experience ?? "",
      specialisations: (t.specialisations ?? []).join(", "),
      languages: (t.languages ?? []).join(", "),
    })),
  };
}

/** Converts form state into the public document. Only public-safe fields are written. */
function toDoc(c: LandingContent) {
  return {
    ...c,
    seo: { ...c.seo, keywords: splitList(c.seo.keywords) },
    serviceAreas: c.serviceAreas.map((a) => a.trim()).filter(Boolean),
    services: c.services.filter((s) => s.name.trim()),
    faqs: c.faqs.filter((f) => f.question.trim() && f.answer.trim()),
    testimonials: c.testimonials.filter((t) => t.name.trim() && t.quote.trim()),
    featuredTrainers: c.featuredTrainers
      .filter((t) => t.name.trim())
      .map((t) => ({
        name: t.name,
        photoUrl: t.photoUrl,
        experience: t.experience,
        specialisations: splitList(t.specialisations),
        languages: splitList(t.languages),
      })),
    updatedAt: serverTimestamp(),
  };
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ImageField({ label, value, folder, onChange }: {
  label: string; value: string; folder: string; onChange: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const upload = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const fileRef = ref(storage, `landing/${folder}/${Date.now()}_${file.name}`);
      await uploadBytes(fileRef, file);
      onChange(await getDownloadURL(fileRef));
      toast.success("Image uploaded");
    } catch {
      toast.error("Upload failed — paste an image URL instead, or check Storage rules for landing/*");
    } finally {
      setUploading(false);
    }
  };
  return (
    <Field label={label}>
      <div className="flex items-center gap-3">
        {value && <img src={value} alt="" className="h-12 w-12 rounded-full object-cover border" />}
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Image URL" />
        <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent">
          <Upload className="h-4 w-4" />
          {uploading ? "Uploading…" : "Upload"}
          <input type="file" accept="image/*" className="hidden" disabled={uploading}
            onChange={(e) => upload(e.target.files?.[0])} />
        </label>
      </div>
    </Field>
  );
}

function ListCard({ title, onRemove, children }: { title: string; onRemove: () => void; children: React.ReactNode }) {
  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{title}</span>
        <Button type="button" variant="destructive" size="sm" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {children}
    </div>
  );
}

export default function LandingPageAdmin() {
  const [content, setContent] = useState<LandingContent>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const { data: categories } = useFirestoreQuery<any>(["categories"], "categories");
  const { data: areas } = useFirestoreQuery<any>(["service_areas"], "service_areas");
  const { data: trainers } = useFirestoreQuery<any>(["trainers"], "trainers");

  useEffect(() => {
    getDoc(doc(db, "landing_page", "content"))
      .then((snap) => snap.exists() && setContent(fromDoc(snap.data())))
      .catch(() => toast.error("Could not load landing page content"))
      .finally(() => setLoading(false));
  }, []);

  const set = <K extends keyof LandingContent>(key: K, value: LandingContent[K]) =>
    setContent((c) => ({ ...c, [key]: value }));
  const setIn = <K extends "hero" | "contact" | "appLinks" | "seo">(
    key: K, field: keyof LandingContent[K], value: string
  ) => setContent((c) => ({ ...c, [key]: { ...c[key], [field]: value } }));
  const patchAt = <T,>(list: T[], i: number, patch: Partial<T>) =>
    list.map((item, idx) => (idx === i ? { ...item, ...patch } : item));

  const save = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, "landing_page", "content"), toDoc(content));
      toast.success("Saved — the website updates within about a minute");
    } catch {
      toast.error("Save failed — check the Firestore rules for landing_page");
    } finally {
      setSaving(false);
    }
  };

  const importServices = () => {
    const active = (categories ?? [])
      .filter((c: any) => c.isActive !== false && !c.isDeleted)
      .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
    if (!active.length) return toast.error("No active categories found");
    set("services", active.map((c: any) => ({
      name: c.name ?? "", description: c.description ?? "", imageUrl: c.imageUrl ?? "",
    })));
    toast.success(`Imported ${active.length} categories — review, then Save`);
  };

  const importAreas = () => {
    const names = (areas ?? []).filter((a: any) => a.isActive !== false).map((a: any) => a.name);
    if (!names.length) return toast.error("No active service areas found");
    set("serviceAreas", names);
    toast.success(`Imported ${names.length} service areas — review, then Save`);
  };

  if (loading) return <div className="p-6 space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-64 w-full" /></div>;

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Landing Page</h1>
          <p className="text-muted-foreground">
            Manage the content of the public website (3repsfitness.com). Changes go live in about a minute.
            Empty sections are hidden on the website.
          </p>
        </div>
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
      </div>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="services">Services &amp; Areas</TabsTrigger>
          <TabsTrigger value="faqs">FAQs</TabsTrigger>
          <TabsTrigger value="testimonials">Testimonials</TabsTrigger>
          <TabsTrigger value="trainers">Trainers</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-8 pt-4">
          <section className="space-y-4">
            <h2 className="font-semibold">Hero</h2>
            <Field label="Eyebrow"><Input value={content.hero.eyebrow} onChange={(e) => setIn("hero", "eyebrow", e.target.value)} /></Field>
            <Field label="Headline"><Input value={content.hero.headline} onChange={(e) => setIn("hero", "headline", e.target.value)} /></Field>
            <Field label="Sub text"><Textarea rows={3} value={content.hero.subtext} onChange={(e) => setIn("hero", "subtext", e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Primary button"><Input value={content.hero.primaryCta} onChange={(e) => setIn("hero", "primaryCta", e.target.value)} /></Field>
              <Field label="Secondary button"><Input value={content.hero.secondaryCta} onChange={(e) => setIn("hero", "secondaryCta", e.target.value)} /></Field>
            </div>
            <p className="text-xs text-muted-foreground">Leave a field empty to use the website&apos;s default text.</p>
          </section>

          <section className="space-y-4">
            <h2 className="font-semibold">Contact details</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Email"><Input type="email" value={content.contact.email} onChange={(e) => setIn("contact", "email", e.target.value)} /></Field>
              <Field label="Phone" hint="Include country code, e.g. +91 98765 43210"><Input value={content.contact.phone} onChange={(e) => setIn("contact", "phone", e.target.value)} /></Field>
              <Field label="WhatsApp number" hint="Include country code"><Input value={content.contact.whatsapp} onChange={(e) => setIn("contact", "whatsapp", e.target.value)} /></Field>
            </div>
            <Field label="Business address"><Textarea rows={2} value={content.contact.address} onChange={(e) => setIn("contact", "address", e.target.value)} /></Field>
          </section>

          <section className="space-y-4">
            <h2 className="font-semibold">App store links</h2>
            <Field label="Google Play URL"><Input value={content.appLinks.android} onChange={(e) => setIn("appLinks", "android", e.target.value)} /></Field>
            <Field label="App Store URL" hint="Leave empty to hide the App Store button until the iOS app is live."><Input value={content.appLinks.ios} onChange={(e) => setIn("appLinks", "ios", e.target.value)} /></Field>
          </section>

          <section className="space-y-4">
            <h2 className="font-semibold">SEO</h2>
            <Field label="Page title" hint="Around 50–60 characters."><Input value={content.seo.title} onChange={(e) => setIn("seo", "title", e.target.value)} /></Field>
            <Field label="Meta description" hint="Around 150–160 characters."><Textarea rows={3} value={content.seo.description} onChange={(e) => setIn("seo", "description", e.target.value)} /></Field>
            <Field label="Keywords" hint="Comma separated."><Input value={content.seo.keywords} onChange={(e) => setIn("seo", "keywords", e.target.value)} /></Field>
          </section>
        </TabsContent>

        <TabsContent value="services" className="space-y-8 pt-4">
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Services</h2>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={importServices}>
                  <Download className="mr-2 h-4 w-4" /> Import from Categories
                </Button>
                <Button type="button" size="sm" onClick={() => set("services", [...content.services, { name: "", description: "", imageUrl: "" }])}>
                  <Plus className="mr-2 h-4 w-4" /> Add
                </Button>
              </div>
            </div>
            {content.services.map((s, i) => (
              <ListCard key={i} title={s.name || `Service ${i + 1}`} onRemove={() => set("services", content.services.filter((_, x) => x !== i))}>
                <Field label="Name"><Input value={s.name} onChange={(e) => set("services", patchAt(content.services, i, { name: e.target.value }))} /></Field>
                <Field label="Description"><Textarea rows={2} value={s.description} onChange={(e) => set("services", patchAt(content.services, i, { description: e.target.value }))} /></Field>
                <ImageField label="Image (optional)" value={s.imageUrl} folder="services" onChange={(url) => set("services", patchAt(content.services, i, { imageUrl: url }))} />
              </ListCard>
            ))}
            {!content.services.length && <p className="text-sm text-muted-foreground">No services set — the website shows its 10 default services.</p>}
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Service areas</h2>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={importAreas}>
                  <Download className="mr-2 h-4 w-4" /> Import from Service Areas
                </Button>
                <Button type="button" size="sm" onClick={() => set("serviceAreas", [...content.serviceAreas, ""])}>
                  <Plus className="mr-2 h-4 w-4" /> Add
                </Button>
              </div>
            </div>
            {content.serviceAreas.map((a, i) => (
              <div key={i} className="flex gap-2">
                <Input value={a} placeholder="e.g. Bangalore" onChange={(e) => set("serviceAreas", content.serviceAreas.map((x, idx) => (idx === i ? e.target.value : x)))} />
                <Button type="button" variant="destructive" size="sm" onClick={() => set("serviceAreas", content.serviceAreas.filter((_, x) => x !== i))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            {!content.serviceAreas.length && <p className="text-sm text-muted-foreground">No areas set — the website shows &quot;Bangalore&quot;.</p>}
          </section>
        </TabsContent>

        <TabsContent value="faqs" className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">FAQs</h2>
            <Button type="button" size="sm" onClick={() => set("faqs", [...content.faqs, { question: "", answer: "" }])}><Plus className="mr-2 h-4 w-4" /> Add</Button>
          </div>
          {content.faqs.map((f, i) => (
            <ListCard key={i} title={f.question || `FAQ ${i + 1}`} onRemove={() => set("faqs", content.faqs.filter((_, x) => x !== i))}>
              <Field label="Question"><Input value={f.question} onChange={(e) => set("faqs", patchAt(content.faqs, i, { question: e.target.value }))} /></Field>
              <Field label="Answer"><Textarea rows={3} value={f.answer} onChange={(e) => set("faqs", patchAt(content.faqs, i, { answer: e.target.value }))} /></Field>
            </ListCard>
          ))}
          {!content.faqs.length && <p className="text-sm text-muted-foreground">No FAQs — the FAQ section is hidden on the website.</p>}
        </TabsContent>

        <TabsContent value="testimonials" className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Testimonials</h2>
            <Button type="button" size="sm" onClick={() => set("testimonials", [...content.testimonials, { name: "", role: "", quote: "", photoUrl: "" }])}><Plus className="mr-2 h-4 w-4" /> Add</Button>
          </div>
          {content.testimonials.map((t, i) => (
            <ListCard key={i} title={t.name || `Testimonial ${i + 1}`} onRemove={() => set("testimonials", content.testimonials.filter((_, x) => x !== i))}>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Name"><Input value={t.name} onChange={(e) => set("testimonials", patchAt(content.testimonials, i, { name: e.target.value }))} /></Field>
                <Field label="Role / detail (optional)"><Input value={t.role} onChange={(e) => set("testimonials", patchAt(content.testimonials, i, { role: e.target.value }))} /></Field>
              </div>
              <Field label="Testimonial"><Textarea rows={3} value={t.quote} onChange={(e) => set("testimonials", patchAt(content.testimonials, i, { quote: e.target.value }))} /></Field>
              <ImageField label="Photo" value={t.photoUrl} folder="testimonials" onChange={(url) => set("testimonials", patchAt(content.testimonials, i, { photoUrl: url }))} />
            </ListCard>
          ))}
          {!content.testimonials.length && <p className="text-sm text-muted-foreground">No testimonials — the section is hidden on the website. Only add real testimonials from members who agreed to be featured.</p>}
        </TabsContent>

        <TabsContent value="trainers" className="space-y-4 pt-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold">Featured trainers</h2>
              <p className="text-xs text-muted-foreground">Only name, photo, specialisations, languages and experience are published. Add trainers only with their consent.</p>
            </div>
            <div className="flex gap-2">
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                defaultValue=""
                onChange={(e) => {
                  const t = (trainers ?? []).find((x: any) => x.id === e.target.value);
                  if (!t) return;
                  set("featuredTrainers", [...content.featuredTrainers, {
                    name: t.name ?? t.fullName ?? "",
                    photoUrl: t.photoUrl ?? "",
                    specialisations: (t.specialization ?? []).join(", "),
                    languages: (t.languagesSpoken ?? []).join(", "),
                    experience: t.experienceYears ? `${t.experienceYears} years experience` : "",
                  }]);
                  e.target.value = "";
                }}
              >
                <option value="">Prefill from a trainer…</option>
                {(trainers ?? []).filter((t: any) => t.status === "active").map((t: any) => (
                  <option key={t.id} value={t.id}>{t.name ?? t.fullName ?? t.id}</option>
                ))}
              </select>
              <Button type="button" size="sm" onClick={() => set("featuredTrainers", [...content.featuredTrainers, { name: "", photoUrl: "", specialisations: "", languages: "", experience: "" }])}><Plus className="mr-2 h-4 w-4" /> Add</Button>
            </div>
          </div>
          {content.featuredTrainers.map((t, i) => (
            <ListCard key={i} title={t.name || `Trainer ${i + 1}`} onRemove={() => set("featuredTrainers", content.featuredTrainers.filter((_, x) => x !== i))}>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Name"><Input value={t.name} onChange={(e) => set("featuredTrainers", patchAt(content.featuredTrainers, i, { name: e.target.value }))} /></Field>
                <Field label="Experience" hint="e.g. 8 years experience"><Input value={t.experience} onChange={(e) => set("featuredTrainers", patchAt(content.featuredTrainers, i, { experience: e.target.value }))} /></Field>
                <Field label="Specialisations" hint="Comma separated"><Input value={t.specialisations} onChange={(e) => set("featuredTrainers", patchAt(content.featuredTrainers, i, { specialisations: e.target.value }))} /></Field>
                <Field label="Languages" hint="Comma separated"><Input value={t.languages} onChange={(e) => set("featuredTrainers", patchAt(content.featuredTrainers, i, { languages: e.target.value }))} /></Field>
              </div>
              <ImageField label="Photo" value={t.photoUrl} folder="trainers" onChange={(url) => set("featuredTrainers", patchAt(content.featuredTrainers, i, { photoUrl: url }))} />
            </ListCard>
          ))}
          {!content.featuredTrainers.length && <p className="text-sm text-muted-foreground">No trainers — the section is hidden on the website.</p>}
        </TabsContent>
      </Tabs>

      <div className="mt-8 flex justify-end border-t pt-4">
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
      </div>
    </div>
  );
}
