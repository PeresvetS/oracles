'use client';

import { useState, useCallback, type KeyboardEvent } from 'react';
import { useI18n } from '@/i18n/context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { SESSION_STATUS, SESSION_LIMITS } from '@/types/index';
import type { SessionStatus } from '@/types/index';

interface SessionControlsProps {
  sessionId: string;
  status: SessionStatus;
  currentRound: number;
  maxRounds: number;
  /** Callback для инвалидации данных сессии после действия */
  onStatusChange?: () => void;
}

/**
 * Нижняя панель управления сессией:
 * Pause / Resume / Stop кнопки + индикатор раундов + поле ввода сообщения.
 */
export function SessionControls({
  sessionId,
  status,
  currentRound,
  maxRounds,
  onStatusChange,
}: SessionControlsProps) {
  const { t } = useI18n();
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [addRoundsOpen, setAddRoundsOpen] = useState(false);
  const [newMaxRounds, setNewMaxRounds] = useState(maxRounds + 1);

  const isRunning = status === SESSION_STATUS.RUNNING;
  const isPaused = status === SESSION_STATUS.PAUSED;
  const isActive = isRunning || isPaused;
  const canSendMessage = status !== SESSION_STATUS.CONFIGURING;

  const handlePause = useCallback(async () => {
    try {
      await api.post(`/api/sessions/${sessionId}/pause`);
      onStatusChange?.();
    } catch {
      toast.error(t.errors.generic);
    }
  }, [sessionId, onStatusChange, t]);

  const handleResume = useCallback(async () => {
    try {
      await api.post<unknown>(`/api/sessions/${sessionId}/resume`, {});
      onStatusChange?.();
    } catch {
      toast.error(t.errors.generic);
    }
  }, [sessionId, onStatusChange, t]);

  const handleStop = useCallback(async () => {
    try {
      if (isRunning) {
        await api.post(`/api/sessions/${sessionId}/pause`);
      }
      await api.post<unknown>(`/api/sessions/${sessionId}/resume`, {
        message: t.session.stopFinalizeInstruction,
      });
      setShowStopConfirm(false);
      onStatusChange?.();
    } catch {
      toast.error(t.errors.generic);
    }
  }, [isRunning, sessionId, onStatusChange, t]);

  const handleSendMessage = useCallback(async () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    setIsSending(true);
    try {
      await api.post<unknown>(`/api/sessions/${sessionId}/message`, { content: trimmed });
      setMessage('');
    } catch {
      toast.error(t.errors.generic);
    } finally {
      setIsSending(false);
    }
  }, [sessionId, message, t]);

  const handleAddRounds = useCallback(async () => {
    const clamped = Math.min(Math.max(newMaxRounds, currentRound + 1), SESSION_LIMITS.MAX_ROUNDS);
    if (clamped <= maxRounds) return;
    try {
      await api.patch<unknown>(`/api/sessions/${sessionId}/max-rounds`, { maxRounds: clamped });
      setAddRoundsOpen(false);
      onStatusChange?.();
    } catch {
      toast.error(t.errors.generic);
    }
  }, [sessionId, newMaxRounds, currentRound, maxRounds, onStatusChange, t]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void handleSendMessage();
      }
    },
    [handleSendMessage],
  );

  return (
    <div className="border-t bg-background px-4 py-3">
      {/* Встроенное подтверждение остановки */}
      {showStopConfirm && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
          <span className="text-muted-foreground">{t.session.stopConfirmMessage}</span>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              void handleStop();
            }}
          >
            {t.common.confirm}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowStopConfirm(false)}>
            {t.common.cancel}
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {/* Кнопки управления статусом */}
        {isRunning && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void handlePause();
            }}
          >
            {t.session.pauseButton}
          </Button>
        )}
        {isPaused && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void handleResume();
            }}
          >
            {t.session.resumeButton}
          </Button>
        )}
        {isActive && !showStopConfirm && (
          <Button size="sm" variant="destructive" onClick={() => setShowStopConfirm(true)}>
            {t.session.stopButton}
          </Button>
        )}

        {/* Индикатор раундов + Dialog добавления раундов */}
        <span className="text-sm text-muted-foreground">
          {t.session.roundsIndicator} {currentRound}/{maxRounds}
        </span>
        {isActive && maxRounds < SESSION_LIMITS.MAX_ROUNDS && (
          <Dialog
            open={addRoundsOpen}
            onOpenChange={(open) => {
              setAddRoundsOpen(open);
              if (open) setNewMaxRounds(maxRounds + 1);
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm" variant="ghost" className="text-muted-foreground">
                + {t.session.addRounds}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>{t.session.addRoundsDialogTitle}</DialogTitle>
                <DialogDescription>{t.session.addRoundsDialogDesc}</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-2 py-2">
                <Label htmlFor="new-max-rounds">{t.session.addRoundsDialogNewValue}</Label>
                <Input
                  id="new-max-rounds"
                  type="number"
                  min={currentRound + 1}
                  max={SESSION_LIMITS.MAX_ROUNDS}
                  value={newMaxRounds}
                  onChange={(e) => setNewMaxRounds(Number(e.target.value))}
                />
              </div>
              <DialogFooter>
                <Button
                  onClick={() => {
                    void handleAddRounds();
                  }}
                  disabled={newMaxRounds <= maxRounds}
                >
                  {t.session.addRoundsConfirm}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Поле ввода сообщения пользователя */}
        <div className="flex min-w-0 flex-1 gap-2">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t.session.messagePlaceholder}
            disabled={!canSendMessage || isSending}
            rows={2}
            className="flex min-h-16 min-w-0 flex-1 resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
          <Button
            size="sm"
            onClick={() => {
              void handleSendMessage();
            }}
            disabled={!canSendMessage || isSending || !message.trim()}
          >
            {t.session.sendMessage}
          </Button>
        </div>
      </div>
    </div>
  );
}
