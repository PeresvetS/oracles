'use client';

import { cn, formatCost } from '@/lib/utils';
import { MESSAGE_ROLE } from '@/types/index';
import { ToolCallDisplay } from '@/components/chat/tool-call-display';
import { MarkdownContent } from '@/components/chat/markdown-content';
import { useI18n } from '@/i18n/context';
import type { MessageWithAgent, StreamingMessage } from '@/types/index';

/** Маппинг цвета агента (из AGENT_COLORS) на класс Tailwind для левой границы */
const AGENT_COLOR_BORDER_CLASS: Record<string, string> = {
  blue: 'border-l-blue-500',
  emerald: 'border-l-emerald-500',
  orange: 'border-l-orange-500',
  yellow: 'border-l-yellow-500',
  cyan: 'border-l-cyan-500',
  pink: 'border-l-pink-500',
  red: 'border-l-red-500',
  purple: 'border-l-purple-500',
  green: 'border-l-green-500',
  gray: 'border-l-gray-400',
};

/** Данные вызова инструмента для отображения */
export interface ToolCallInfo {
  tool: string;
  query: string;
  result: string | null;
  isLoading: boolean;
}

interface MessageBubbleProps {
  message: MessageWithAgent | StreamingMessage;
  /** Цвет агента из AGENT_COLORS (например, 'blue', 'emerald') */
  agentColor?: string;
  /** Вызовы инструментов для данного агента */
  toolCalls?: ToolCallInfo[];
}

/** Type guard: определяет, является ли сообщение стриминговым */
function isStreamingMessage(
  msg: MessageWithAgent | StreamingMessage,
): msg is StreamingMessage {
  return 'isStreaming' in msg;
}

/** Нормализованное представление сообщения для рендеринга */
interface NormalizedMessage {
  id: string;
  role: string;
  content: string;
  agentName: string | null;
  modelId: string | null;
  costUsd?: number;
  createdAt: string | null;
  isStreaming: boolean;
}

function normalizeMessage(msg: MessageWithAgent | StreamingMessage): NormalizedMessage {
  if (isStreamingMessage(msg)) {
    return {
      id: msg.id,
      role: msg.agentRole ?? 'ASSISTANT',
      content: msg.content,
      agentName: msg.agentName,
      modelId: msg.modelId ?? null,
      costUsd: msg.costUsd,
      createdAt: msg.createdAt ?? null,
      isStreaming: msg.isStreaming,
    };
  }

  return {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    agentName: msg.agent?.name ?? null,
    modelId: msg.agent?.modelId ?? null,
    costUsd: msg.costUsd ?? undefined,
    createdAt: msg.createdAt,
    isStreaming: false,
  };
}

/** Пузырь сообщения с цветной левой границей по роли агента */
export function MessageBubble({ message, agentColor = 'gray', toolCalls }: MessageBubbleProps) {
  const { locale } = useI18n();
  const normalized = normalizeMessage(message);
  const borderClass = AGENT_COLOR_BORDER_CLASS[agentColor] ?? 'border-l-gray-400';
  const localeCode = locale === 'ru' ? 'ru-RU' : 'en-US';

  const formattedTime =
    normalized.createdAt != null
      ? new Date(normalized.createdAt).toLocaleTimeString(localeCode, {
          hour: '2-digit',
          minute: '2-digit',
        })
      : null;

  // SYSTEM-сообщения: центрированная пилюля
  if (normalized.role === MESSAGE_ROLE.SYSTEM) {
    return (
      <div className="my-2 text-center">
        <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
          {normalized.content}
        </span>
      </div>
    );
  }

  return (
    <div className={cn('border-l-2 py-2 pl-4', borderClass)}>
      {/* Хедер: имя агента, модель, время, стоимость */}
      <div className="mb-1 flex items-center gap-2">
        {normalized.agentName && (
          <span className="text-sm font-semibold">{normalized.agentName}</span>
        )}
        {normalized.modelId && (
          <span className="font-mono text-xs text-muted-foreground">{normalized.modelId}</span>
        )}
        {formattedTime && (
          <span className="ml-auto text-xs text-muted-foreground">{formattedTime}</span>
        )}
        {normalized.costUsd != null && normalized.costUsd > 0 && (
          <span className="font-mono text-xs text-muted-foreground">
            {formatCost(normalized.costUsd)}
          </span>
        )}
      </div>

      {/* Tool calls (если есть) */}
      {toolCalls && toolCalls.length > 0 && (
        <div className="mb-2">
          {toolCalls.map((tc, idx) => (
            <ToolCallDisplay
              key={`${tc.tool}-${idx}`}
              tool={tc.tool}
              query={tc.query}
              result={tc.result}
              isLoading={tc.isLoading}
            />
          ))}
        </div>
      )}

      {/* Контент с markdown-разметкой и мигающим курсором при стриминге */}
      <div className="text-sm leading-relaxed">
        <MarkdownContent content={normalized.content} />
        {normalized.isStreaming && (
          <span className="ml-0.5 inline-block animate-pulse text-muted-foreground">▌</span>
        )}
      </div>
    </div>
  );
}
