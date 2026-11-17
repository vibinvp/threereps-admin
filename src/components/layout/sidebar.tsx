"use client";

import { NavList } from "./nav-list";

export function Sidebar() {
  return (
    <aside className="w-64 flex-shrink-0 border-r bg-card flex-col h-full hidden md:flex">
      <div className="h-16 flex items-center px-6 border-b font-bold text-xl tracking-tight text-primary">
        ThreeReps Admin
      </div>
      <NavList />
    </aside>
  );
}
