'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { clsx } from 'clsx';
import {
  MessageSquare,
  KeyRound,
  FileText,
  Cpu,
  Menu,
  X,
  Sun,
  Moon,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/auth-store';
import { useI18n } from '@/i18n/context';

/** Элемент навигации */
interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
}

/** Кнопка переключения темы — без лишнего локального состояния */
function ThemeToggleButton({ label }: { label: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = resolvedTheme !== undefined;

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={label} disabled>
        <Sun className="h-4 w-4" />
      </Button>
    );
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      aria-label={label}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

/** Содержимое сайдбара */
function SidebarContent({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const { user, logout } = useAuthStore();
  const [adminExpanded, setAdminExpanded] = useState(
    pathname.startsWith('/admin'),
  );

  const mainNav: NavItem[] = [
    { href: '/sessions', label: t.nav.sessions, icon: <MessageSquare className="h-4 w-4" /> },
  ];

  const adminNav: NavItem[] = [
    { href: '/admin', label: t.nav.admin, icon: <KeyRound className="h-4 w-4" /> },
    { href: '/admin/prompts', label: t.nav.prompts, icon: <FileText className="h-4 w-4" /> },
    { href: '/admin/models', label: t.nav.models, icon: <Cpu className="h-4 w-4" /> },
  ];

  const handleLogout = (): void => {
    logout();
    router.replace('/login');
    onClose?.();
  };

  const isActive = (href: string): boolean => {
    if (href === '/sessions') return pathname.startsWith('/sessions');
    return pathname === href;
  };

  return (
    <div className="flex h-full flex-col">
      {/* Логотип */}
      <div className="flex h-14 shrink-0 items-center border-b px-4">
        <Link
          href="/sessions"
          className="text-lg font-bold tracking-tight"
          onClick={onClose}
        >
          Oracle
        </Link>
      </div>

      {/* Навигация */}
      <nav className="flex-1 overflow-y-auto py-4">
        {/* Основные ссылки */}
        <ul className="space-y-1 px-2">
          {mainNav.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onClose}
                className={clsx(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  isActive(item.href)
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {item.icon}
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        {/* Секция Администрирование */}
        <div className="mt-4 px-2">
          <button
            onClick={() => setAdminExpanded((v) => !v)}
            className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            <span>{t.nav.adminTitle}</span>
            <ChevronDown
              className={clsx(
                'h-3 w-3 transition-transform',
                adminExpanded && 'rotate-180',
              )}
            />
          </button>
          {adminExpanded && (
            <ul className="mt-1 space-y-1">
              {adminNav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    className={clsx(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                      isActive(item.href)
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    {item.icon}
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </nav>

      {/* Нижняя панель: тема + пользователь + логаут */}
      <div className="shrink-0 border-t p-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            {user && (
              <p className="truncate text-xs font-medium">{user.name}</p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggleButton label={t.theme.toggle} />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              aria-label={t.common.logout}
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface AppShellProps {
  children: ReactNode;
}

/**
 * Обёртка-оболочка приложения: фиксированный сайдбар слева + контент справа.
 * На мобайле сайдбар скрыт и открывается по кнопке.
 */
export function AppShell({ children }: AppShellProps) {
  const { t } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen bg-background">
      {/* Сайдбар: десктоп (в потоке) */}
      <aside className="hidden w-56 shrink-0 flex-col border-r bg-card lg:flex">
        <SidebarContent />
      </aside>

      {/* Сайдбар: мобайл (оверлей) */}
      {mobileOpen && (
        <>
          {/* Затемнение фона */}
          <div
            className="fixed inset-0 z-40 bg-black/60 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
          {/* Выдвижная панель */}
          <aside className="fixed inset-y-0 left-0 z-50 flex w-56 flex-col border-r bg-card lg:hidden">
            <SidebarContent onClose={() => setMobileOpen(false)} />
          </aside>
        </>
      )}

      {/* Основной контент */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Мобильный хедер */}
        <div className="flex h-12 shrink-0 items-center gap-3 border-b bg-card px-4 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={t.nav.menuToggle}
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
          <span className="text-base font-bold">Oracle</span>
        </div>

        {/* Страница */}
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
