'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n/context';

interface ExportButtonsProps {
  sessionId: string;
}

/** Кнопки экспорта отчёта в CSV и JSON */
export function ExportButtons({ sessionId }: ExportButtonsProps) {
  const { t } = useI18n();
  const [loadingCsv, setLoadingCsv] = useState(false);
  const [loadingJson, setLoadingJson] = useState(false);

  const downloadFile = async (format: 'csv' | 'json') => {
    const setLoading = format === 'csv' ? setLoadingCsv : setLoadingJson;
    setLoading(true);
    try {
      const blob = await api.downloadBlob(
        `/api/sessions/${sessionId}/report/export?format=${format}`,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-${sessionId}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.errors.generic);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => downloadFile('csv')}
        disabled={loadingCsv}
      >
        {loadingCsv ? t.common.loading : t.report.exportCsv}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => downloadFile('json')}
        disabled={loadingJson}
      >
        {loadingJson ? t.common.loading : t.report.exportJson}
      </Button>
    </div>
  );
}
