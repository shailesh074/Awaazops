"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { BrandLockup } from "@/components/shared/brand-mark";
import { ConsoleNav } from "./console-nav";

export function ConsoleMobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open navigation" className="lg:hidden">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 bg-sidebar p-4">
        <SheetHeader className="p-0 pb-6">
          <SheetTitle>
            <BrandLockup />
          </SheetTitle>
        </SheetHeader>
        <ConsoleNav onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
