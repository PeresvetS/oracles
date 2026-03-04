'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useI18n } from '@/i18n/context';
import { cn } from '@/lib/utils';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible';

interface ToolCallDisplayProps {
  tool: string;
  query: string;
  result: string | null;
  isLoading: boolean;
}

/** Сворачиваемый блок вызова инструмента агентом (web_search / call_researcher) */
export function ToolCallDisplay({ tool, query, result, isLoading }: ToolCallDisplayProps) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);

  const toolLabel =
    tool === 'web_search'
      ? t.session.webSearch
      : tool === 'call_researcher'
        ? t.session.callResearcher
        : tool;

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="my-2 rounded-md border border-border bg-muted/40"
    >
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
        <ChevronDown
          className={cn('h-3.5 w-3.5 shrink-0 transition-transform', isOpen && 'rotate-180')}
        />
        <span className="shrink-0 font-semibold">{toolLabel}</span>
        <span className="min-w-0 truncate text-left text-muted-foreground/70">{query}</span>
        {isLoading && (
          <span className="ml-auto shrink-0 animate-pulse text-yellow-400">
            {t.session.toolLoading}
          </span>
        )}
      </CollapsibleTrigger>

      <CollapsibleContent className="border-t border-border px-3 py-2">
        <p className="mb-1 text-xs font-medium text-muted-foreground">{t.session.toolResult}:</p>
        {result ? (
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs text-foreground/80">
            {result}
          </pre>
        ) : (
          <p className="text-xs text-muted-foreground/50">{t.session.toolLoading}</p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
