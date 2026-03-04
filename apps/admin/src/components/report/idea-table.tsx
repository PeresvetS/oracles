'use client';

import { useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { useI18n } from '@/i18n/context';
import type { ReportIdea } from '@/types';

interface IdeaTableProps {
  ideas: ReportIdea[];
  onSelect: (idea: ReportIdea) => void;
  selectedTitle: string | null;
}

/** Таблица финальных идей с сортировкой по ICE/RICE */
export function IdeaTable({ ideas, onSelect, selectedTitle }: IdeaTableProps) {
  const { t } = useI18n();
  const [sorting, setSorting] = useState<SortingState>([{ id: 'avgIce', desc: true }]);

  const columns: ColumnDef<ReportIdea>[] = [
    {
      accessorKey: 'title',
      header: t.report.ideaName,
      cell: ({ getValue }) => (
        <span className="font-medium">{getValue() as string}</span>
      ),
    },
    {
      accessorKey: 'avgIce',
      header: t.report.iceAvg,
      cell: ({ getValue }) => {
        const v = getValue() as number | null;
        return <span className="font-mono">{v != null ? v.toFixed(1) : '—'}</span>;
      },
    },
    {
      accessorKey: 'avgRice',
      header: t.report.riceAvg,
      cell: ({ getValue }) => {
        const v = getValue() as number | null;
        return <span className="font-mono">{v != null ? v.toFixed(1) : '—'}</span>;
      },
    },
    {
      id: 'budget',
      header: t.report.budget,
      accessorFn: (row) => {
        const d = row.details as Record<string, unknown> | null;
        return d?.budget ?? '—';
      },
      cell: ({ getValue }) => (
        <span className="text-muted-foreground">{getValue() as string}</span>
      ),
    },
    {
      id: 'timeToRevenue',
      header: t.report.timeToRevenue,
      accessorFn: (row) => {
        const d = row.details as Record<string, unknown> | null;
        return d?.timeToRevenue ?? '—';
      },
      cell: ({ getValue }) => (
        <span className="text-muted-foreground">{getValue() as string}</span>
      ),
    },
  ];

  // TanStack Table хук несовместим с memoization-анализом React Compiler.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: ideas,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="bg-muted/30 text-muted-foreground text-xs">
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="px-4 py-2 text-left cursor-pointer select-none hover:text-foreground transition-colors"
                  onClick={header.column.getToggleSortingHandler()}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  {header.column.getIsSorted() === 'asc' && ' ↑'}
                  {header.column.getIsSorted() === 'desc' && ' ↓'}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => {
            const isSelected = row.original.title === selectedTitle;
            return (
              <tr
                key={row.id}
                className={`border-t border-border/50 cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-muted/30'
                }`}
                onClick={() => onSelect(row.original)}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
