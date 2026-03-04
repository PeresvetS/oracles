'use client';

import { useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n/context';
import type { ReportRejectedIdea } from '@/types';

interface RejectedIdeasListProps {
  ideas: ReportRejectedIdea[];
}

/** Сворачиваемый список отклонённых идей */
export function RejectedIdeasList({ ideas }: RejectedIdeasListProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  if (ideas.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="sm" className="flex items-center gap-2">
          <span>{t.report.rejectedIdeas}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-mono">
            {ideas.length}
          </span>
          <span className="text-muted-foreground">{open ? '▲' : '▼'}</span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 text-muted-foreground text-xs">
                <th className="text-left px-4 py-2">{t.report.ideaName}</th>
                <th className="text-left px-4 py-2 w-16">{t.report.rejectedRound}</th>
                <th className="text-left px-4 py-2">{t.report.rejectedReason}</th>
              </tr>
            </thead>
            <tbody>
              {ideas.map((idea, idx) => (
                <tr key={idx} className="border-t border-border/50">
                  <td className="px-4 py-2 font-medium">{idea.title}</td>
                  <td className="px-4 py-2 text-muted-foreground">{idea.rejectedInRound}</td>
                  <td className="px-4 py-2 text-muted-foreground">{idea.rejectionReason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
