'use client';

import { Badge, badgeVariants } from '@/components/ui/badge';
import { useI18n } from '@/i18n/context';
import { SESSION_STATUS } from '@/types/index';
import type { SessionStatus } from '@/types/index';
import type { VariantProps } from 'class-variance-authority';

/** Маппинг статуса сессии на вариант Badge */
const SESSION_STATUS_VARIANT: Record<
  SessionStatus,
  VariantProps<typeof badgeVariants>['variant']
> = {
  [SESSION_STATUS.CONFIGURING]: 'muted',
  [SESSION_STATUS.RUNNING]: 'info',
  [SESSION_STATUS.PAUSED]: 'warning',
  [SESSION_STATUS.COMPLETED]: 'success',
  [SESSION_STATUS.ERROR]: 'destructive',
};

/** Бейдж статуса сессии с локализованным текстом */
export function StatusBadge({
  status,
  className,
}: {
  status: SessionStatus;
  className?: string;
}) {
  const { t } = useI18n();
  const variant = SESSION_STATUS_VARIANT[status] ?? 'muted';

  const labelMap: Record<SessionStatus, string> = {
    [SESSION_STATUS.CONFIGURING]: t.sessions.statusConfiguring,
    [SESSION_STATUS.RUNNING]: t.sessions.statusRunning,
    [SESSION_STATUS.PAUSED]: t.sessions.statusPaused,
    [SESSION_STATUS.COMPLETED]: t.sessions.statusCompleted,
    [SESSION_STATUS.ERROR]: t.sessions.statusError,
  };

  return (
    <Badge variant={variant} className={className}>
      {labelMap[status] ?? status}
    </Badge>
  );
}
