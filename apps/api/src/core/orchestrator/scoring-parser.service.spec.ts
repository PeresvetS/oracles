import { Test, TestingModule } from '@nestjs/testing';
import { ScoringParserService } from '@core/orchestrator/scoring-parser.service';

describe('ScoringParserService', () => {
  let service: ScoringParserService;

  const validScoringBlock = `### Маркетплейс услуг
ICE: Impact=8, Confidence=7, Ease=6 → Total=7
RICE: Reach=9, Impact=8, Confidence=0.7, Effort=4 → Total=12.6
Обоснование: Высокая рыночная привлекательность`;

  const validScoringBlock2 = `### Платформа обучения
ICE: Impact=6, Confidence=8, Ease=9 → Total=7.67
RICE: Reach=7, Impact=7, Confidence=0.8, Effort=3 → Total=13.07
Обоснование: Стабильный спрос на обучение`;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ScoringParserService],
    }).compile();

    service = module.get<ScoringParserService>(ScoringParserService);
  });

  describe('parseAnalystScoring', () => {
    it('парсит одну идею с корректным форматом', () => {
      const result = service.parseAnalystScoring(validScoringBlock);

      expect(result.size).toBe(1);
      const score = result.get('Маркетплейс услуг');
      expect(score).toBeDefined();
      expect(score!.ice.impact).toBe(8);
      expect(score!.ice.confidence).toBe(7);
      expect(score!.ice.ease).toBe(6);
      expect(score!.rice.reach).toBe(9);
      expect(score!.rice.confidence).toBe(0.7);
    });

    it('парсит несколько идей в одном ответе', () => {
      const content = `${validScoringBlock}\n\n${validScoringBlock2}`;
      const result = service.parseAnalystScoring(content);

      expect(result.size).toBe(2);
      expect(result.has('Маркетплейс услуг')).toBe(true);
      expect(result.has('Платформа обучения')).toBe(true);
    });

    it('пересчитывает ICE total как среднее трёх компонентов', () => {
      const result = service.parseAnalystScoring(validScoringBlock);
      const score = result.get('Маркетплейс услуг')!;

      // (8 + 7 + 6) / 3 = 7
      expect(score.ice.total).toBe(7);
    });

    it('пересчитывает RICE total как (R * I * C) / E', () => {
      const result = service.parseAnalystScoring(validScoringBlock);
      const score = result.get('Маркетплейс услуг')!;

      // (9 * 8 * 0.7) / 4 = 50.4 / 4 = 12.6
      expect(score.rice.total).toBe(12.6);
    });

    it('обрабатывает десятичные значения Confidence в RICE', () => {
      const block = `### Тест десятичных
ICE: Impact=7, Confidence=8, Ease=9 → Total=8
RICE: Reach=6, Impact=7, Confidence=0.85, Effort=5 → Total=7.14
Обоснование: тест`;

      const result = service.parseAnalystScoring(block);
      const score = result.get('Тест десятичных')!;

      expect(score.rice.confidence).toBe(0.85);
    });

    it('обрезает out-of-range значение Impact=15 до 10', () => {
      const block = `### Идея с превышением
ICE: Impact=15, Confidence=7, Ease=6 → Total=9.33
RICE: Reach=9, Impact=8, Confidence=0.7, Effort=4 → Total=12.6
Обоснование: тест`;

      const result = service.parseAnalystScoring(block);
      const score = result.get('Идея с превышением')!;

      expect(score.ice.impact).toBe(10);
    });

    it('обрезает Confidence в RICE > 1.0 до 1.0', () => {
      const block = `### Идея превышение Confidence
ICE: Impact=7, Confidence=7, Ease=7 → Total=7
RICE: Reach=8, Impact=8, Confidence=1.5, Effort=4 → Total=16
Обоснование: тест`;

      const result = service.parseAnalystScoring(block);
      const score = result.get('Идея превышение Confidence')!;

      expect(score.rice.confidence).toBe(1.0);
    });

    it('возвращает пустую Map для пустого текста', () => {
      expect(service.parseAnalystScoring('')).toEqual(new Map());
      expect(service.parseAnalystScoring('   ')).toEqual(new Map());
    });

    it('пропускает блок если нет ICE', () => {
      const block = `### Идея без ICE
RICE: Reach=9, Impact=8, Confidence=0.7, Effort=4 → Total=12.6
Обоснование: тест`;

      const result = service.parseAnalystScoring(block);
      expect(result.size).toBe(0);
    });

    it('пропускает блок если нет RICE', () => {
      const block = `### Идея без RICE
ICE: Impact=8, Confidence=7, Ease=6 → Total=7
Обоснование: тест`;

      const result = service.parseAnalystScoring(block);
      expect(result.size).toBe(0);
    });

    it('парсит кириллические названия идей', () => {
      const block = `### Экосистема для аграриев в России
ICE: Impact=9, Confidence=8, Ease=7 → Total=8
RICE: Reach=10, Impact=9, Confidence=0.6, Effort=5 → Total=10.8
Обоснование: Нишевой рынок`;

      const result = service.parseAnalystScoring(block);
      expect(result.has('Экосистема для аграриев в России')).toBe(true);
    });

    it('обрабатывает реальный LLM-ответ с секцией Обоснование', () => {
      const llmOutput = `
Оцениваю каждую идею:

### Сервис доставки
ICE: Impact=8, Confidence=7, Ease=5 → Total=6.67
RICE: Reach=8, Impact=7, Confidence=0.75, Effort=6 → Total=7
Обоснование: Рынок насыщен, но есть ниши.
Дополнительный комментарий: Стоит рассмотреть B2B сегмент.

### Образовательная платформа
ICE: Impact=9, Confidence=8, Ease=7 → Total=8
RICE: Reach=9, Impact=9, Confidence=0.8, Effort=5 → Total=12.96
Обоснование: Растущий рынок EdTech.
`;

      const result = service.parseAnalystScoring(llmOutput);
      expect(result.size).toBe(2);
      expect(result.has('Сервис доставки')).toBe(true);
      expect(result.has('Образовательная платформа')).toBe(true);
    });

    it('парсит нечувствительно к регистру ICE/RICE', () => {
      const block = `### Тест регистра
ice: Impact=7, Confidence=7, Ease=7 → Total=7
rice: Reach=7, Impact=7, Confidence=0.7, Effort=7 → Total=4.9
Обоснование: тест`;

      const result = service.parseAnalystScoring(block);
      // ICE/RICE регексы используют /i флаг
      expect(result.size).toBe(1);
    });
  });

  describe('normalizeIdeaTitle', () => {
    it('приводит к нижнему регистру', () => {
      expect(service.normalizeIdeaTitle('ТЕСТ ИДЕЯ')).toBe('тест идея');
    });

    it('убирает русские кавычки «»', () => {
      expect(service.normalizeIdeaTitle('«Маркетплейс»')).toBe('маркетплейс');
    });

    it('убирает английские кавычки ""', () => {
      expect(service.normalizeIdeaTitle('"Test Idea"')).toBe('test idea');
    });

    it('нормализует множественные пробелы', () => {
      expect(service.normalizeIdeaTitle('Идея   с  пробелами')).toBe('идея с пробелами');
    });

    it('обрезает пробелы по краям', () => {
      expect(service.normalizeIdeaTitle('  Идея  ')).toBe('идея');
    });

    it('обрабатывает пустую строку', () => {
      expect(service.normalizeIdeaTitle('')).toBe('');
    });
  });
});
