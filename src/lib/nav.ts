import type { Role } from "@prisma/client";

export type NavLink = {
  href: string;
  label: string;
  visibleTo: ReadonlyArray<Role>;
};

export const NAV_LINKS: ReadonlyArray<NavLink> = [
  {
    href: "/contracts",
    label: "Contracts",
    visibleTo: ["BU_MEMBER", "BU_MANAGER", "LEGAL_REVIEWER", "LEGAL_LEAD", "ADMIN"],
  },
  {
    href: "/legal-performance",
    label: "Legal performance",
    visibleTo: ["LEGAL_LEAD", "ADMIN"],
  },
  {
    href: "/admin",
    label: "Admin",
    visibleTo: ["ADMIN"],
  },
];

export function navLinksForRole(role: Role): NavLink[] {
  return NAV_LINKS.filter((link) => link.visibleTo.includes(role));
}
