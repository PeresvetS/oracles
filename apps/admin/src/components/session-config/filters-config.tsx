'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useI18n } from '@/i18n/context';
import type { FiltersFormState } from '@/types';
import {
  TIME_TO_REVENUE_OPTIONS,
  MARKET_SIZE_OPTIONS,
  LEGAL_RISK_OPTIONS,
  type TimeToRevenueOption,
  type MarketSizeOption,
  type LegalRiskOption,
} from '@/types';

interface FiltersConfigProps {
  value: FiltersFormState;
  onChange: (v: FiltersFormState) => void;
}

/** Компонент настройки фильтров сессии */
export function FiltersConfig({ value, onChange }: FiltersConfigProps) {
  const { t } = useI18n();

  const update = (partial: Partial<FiltersFormState>) => {
    onChange({ ...value, ...partial });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Сложность реализации */}
      <div className="flex flex-col gap-2">
        <Label className="text-sm">
          {t.sessionForm.complexity}
          <span className="ml-2 font-mono text-primary">{value.complexity}</span>
        </Label>
        <Slider
          min={1}
          max={10}
          step={1}
          value={[value.complexity]}
          onValueChange={([v]) => update({ complexity: v })}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>1</span>
          <span>10</span>
        </div>
      </div>

      {/* Бюджет */}
      <div className="flex flex-col gap-1">
        <Label className="text-sm">{t.sessionForm.budget}</Label>
        <Input
          type="number"
          min={0}
          value={value.budget}
          onChange={(e) => {
            const next = e.target.value;
            update({ budget: next === '' ? '' : Number(next) });
          }}
          placeholder={t.sessionForm.budgetPlaceholder}
        />
      </div>

      {/* Время до выручки */}
      <div className="flex flex-col gap-1">
        <Label className="text-sm">{t.sessionForm.timeToRevenue}</Label>
        <Select
          value={value.timeToRevenue}
          onValueChange={(v) => update({ timeToRevenue: v as TimeToRevenueOption })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIME_TO_REVENUE_OPTIONS.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Размер рынка */}
      <div className="flex flex-col gap-1">
        <Label className="text-sm">{t.sessionForm.marketSize}</Label>
        <Select
          value={value.marketSize}
          onValueChange={(v) => update({ marketSize: v as MarketSizeOption })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MARKET_SIZE_OPTIONS.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Юридический риск */}
      <div className="flex flex-col gap-1">
        <Label className="text-sm">{t.sessionForm.legalRisk}</Label>
        <Select
          value={value.legalRisk}
          onValueChange={(v) => update({ legalRisk: v as LegalRiskOption })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LEGAL_RISK_OPTIONS.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Чекбоксы */}
      <div className="flex flex-col gap-3 pt-1">
        <div className="flex items-center gap-2">
          <Checkbox
            id="require-competitors"
            checked={value.requireCompetitors}
            onCheckedChange={(checked) => update({ requireCompetitors: checked === true })}
          />
          <Label htmlFor="require-competitors" className="text-sm cursor-pointer">
            {t.sessionForm.requireCompetitors}
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="operability-check"
            checked={value.operabilityCheck}
            onCheckedChange={(checked) => update({ operabilityCheck: checked === true })}
          />
          <Label htmlFor="operability-check" className="text-sm cursor-pointer">
            {t.sessionForm.operabilityCheck}
          </Label>
        </div>
      </div>
    </div>
  );
}
