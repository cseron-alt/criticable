"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { InstallShortcutButton } from "@/components/install-shortcut-button";
import { canAccessAdmin } from "@/lib/admin-access";
import {
  signOutFromSupabase,
  syncActiveUserFromSupabase,
  type ActiveUser,
} from "@/lib/user-registry";

const navItems = [
  { href: "/pasarela", label: "PASARELA" },
  { href: "/ranking", label: "RANKING" },
  { href: "/reportar", label: "REPORTAR" },
] as const;

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [activeUser, setActiveUser] = useState<ActiveUser | null>(null);
  const isAdmin = canAccessAdmin(activeUser);

  useEffect(() => {
    let cancelled = false;

    async function hydrateActiveUser() {
      const nextUser = await syncActiveUserFromSupabase();

      if (!cancelled) {
        setActiveUser(nextUser);
      }
    }

    void hydrateActiveUser();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSignOut = async () => {
    await signOutFromSupabase();
    setActiveUser(null);
    router.push("/");
    router.refresh();
  };

  return (
    <header className="profile-nav">
      <div className="profile-nav__inner">
        <div className="profile-nav__brand">
          <Link aria-label="criticable" href="/experiment">
            <Image
              alt="criticable"
              className="profile-nav__logo"
              height={60}
              priority
              src="/criticable-logo.png"
              width={360}
            />
          </Link>
        </div>

        <nav aria-label="Secciones principales" className="profile-nav__menu">
          {navItems.map((item) => {
            const isActive = pathname === item.href;

            return (
              <Link
                className={`profile-nav__link ${isActive ? "profile-nav__link--active" : ""}`}
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            );
          })}
          <InstallShortcutButton />
        </nav>

        <div className="profile-nav__actions">
          {isAdmin ? (
            <Link
              className={`profile-nav__link ${pathname === "/admin" ? "profile-nav__link--active" : ""}`}
              href="/admin"
            >
              Admin
            </Link>
          ) : null}
          <Link
            className={`profile-nav__link ${pathname === "/experiment" ? "profile-nav__link--active" : ""}`}
            href="/experiment"
          >
            Mi perfil
          </Link>
          <button
            className="profile-nav__link profile-nav__link--button"
            onClick={() => void handleSignOut()}
            type="button"
          >
            Cerrar sesión
          </button>
          <div className="profile-nav__user">
            <strong>{activeUser?.username ?? "criticable"}</strong>
            <span>{activeUser?.email ?? "acceso restringido"}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
