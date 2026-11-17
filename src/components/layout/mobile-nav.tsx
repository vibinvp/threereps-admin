"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { NavList } from "./nav-list";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden">
      <Button variant="ghost" size="icon" aria-label="Open navigation" onClick={() => setOpen(true)}>
        <Menu className="h-5 w-5" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="p-0 w-72">
          <SheetHeader className="h-16 justify-center px-6 border-b">
            <SheetTitle className="text-primary">ThreeReps Admin</SheetTitle>
          </SheetHeader>
          <NavList onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
