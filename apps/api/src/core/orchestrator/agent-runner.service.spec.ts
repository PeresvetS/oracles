import { Test, TestingModule } from '@nestjs/testing';
import { AgentRunnerService } from '@core/orchestrator/agent-runner.service';
import { PrismaService } from '@prisma/prisma.service';
import { LlmGatewayService } from '@integrations/llm/llm-gateway.service';
import { SESSION_EVENT_EMITTER } from '@core/orchestrator/interfaces/session-event-emitter.interface';
import {
  RESEARCH_LIMIT_REACHED_MESSAGE,
  AGENT_TIMEOUT_ERROR,
} from '@core/orchestrator/constants/orchestrator.constants';
import type { Agent } from '@prisma/client';
import type { SessionWithAgents } from '@core/orchestrator/interfaces/orchestrator.types';

/** Helper: создаёт AsyncIterable из массива чанков */
async function* generateChunks(
  chunks: Array<{
    type: string;
    text?: string;
    reasoning?: string;
    toolCall?: { id: string; type: string; function: { name: string; arguments: string } };
    usage?: { tokensInput: number; tokensOutput: number; costUsd: number };
    annotations?: Array<{ url: string; title: string; content?: string }>;
  }>,
) {
  for (const chunk of chunks) {
    yield chunk;
  }
}

/** Создаёт мок-стрим для chatStream */
function mockStream(
  chunks: Parameters<typeof generateChunks>[0],
): AsyncIterable<(typeof chunks)[0]> {
  return generateChunks(chunks);
}

describe('AgentRunnerService', () => {
  let service: AgentRunnerService;
  let prismaService: {
    message: { create: jest.Mock };
    agent: { update: jest.Mock };
    session: { findUnique: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };
  let llmGateway: { chat: jest.Mock; chatStream: jest.Mock };
  let eventEmitter: {
    emitMessageStart: jest.Mock;
    emitMessageChunk: jest.Mock;
    emitMessageEnd: jest.Mock;
    emitThinkingChunk: jest.Mock;
    emitToolStart: jest.Mock;
    emitToolResult: jest.Mock;
    emitSessionStatusChanged: jest.Mock;
    emitSessionError: jest.Mock;
  };

  const mockAgent: Agent = {
    id: 'agent-1',
    sessionId: 'session-1',
    role: 'ANALYST',
    name: 'Аналитик 1',
    provider: 'openrouter',
    modelId: 'openai/gpt-5.3-chat',
    systemPrompt: 'Ты аналитик',
    webSearchEnabled: true,
    totalTokensInput: 0,
    totalTokensOutput: 0,
    totalCostUsd: 0,
    createdAt: new Date(),
  } as Agent;

  const mockDirectorAgent: Agent = {
    ...mockAgent,
    id: 'director-1',
    role: 'DIRECTOR',
    name: 'Директор',
    webSearchEnabled: true,
  } as Agent;

  const mockResearcherAgent: Agent = {
    ...mockAgent,
    id: 'researcher-1',
    role: 'RESEARCHER',
    name: 'Ресерчер',
    provider: 'perplexity',
    modelId: 'sonar-pro',
    webSearchEnabled: false,
  } as Agent;

  /** Стандартные чанки успешного стрим-ответа */
  const successChunks = [
    { type: 'text', text: 'Ответ аналитика' },
    { type: 'done', usage: { tokensInput: 100, tokensOutput: 50, costUsd: 0.01 } },
  ];

  /** Синхронный ответ LLM (для callResearcher через chat) */
  const mockChatResponse = {
    content: 'Результаты исследования',
    tokensInput: 100,
    tokensOutput: 50,
    costUsd: 0.01,
    latencyMs: 1200,
    model: 'sonar-pro',
    toolCalls: undefined,
  };

  const mockSession: SessionWithAgents = {
    id: 'session-1',
    userId: 'user-1',
    title: 'Тест',
    mode: 'GENERATE',
    status: 'RUNNING',
    inputPrompt: 'Тестовый промпт',
    existingIdeas: null,
    filters: {},
    maxRounds: 5,
    currentRound: 1,
    maxResearchCalls: 3,
    researchCallsUsed: 0,
    totalTokensInput: 0,
    totalTokensOutput: 0,
    totalCostUsd: 0,
    startedAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    agents: [mockDirectorAgent, mockAgent, mockResearcherAgent],
  } as unknown as SessionWithAgents;

  const baseParams = {
    agent: mockAgent,
    messages: [
      { role: 'system' as const, content: 'Системный промпт' },
      { role: 'user' as const, content: 'Вопрос' },
    ],
    sessionId: 'session-1',
    roundId: 'round-1',
  };

  beforeEach(async () => {
    prismaService = {
      message: {
        create: jest.fn().mockResolvedValue({ id: 'msg-1' }),
      },
      agent: {
        update: jest.fn().mockResolvedValue({}),
      },
      session: {
        findUnique: jest.fn().mockResolvedValue({ status: 'RUNNING' }),
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn().mockResolvedValue([{}, {}]),
    };

    llmGateway = {
      chat: jest.fn().mockResolvedValue(mockChatResponse),
      chatStream: jest.fn().mockImplementation(() => mockStream(successChunks)),
    };

    eventEmitter = {
      emitMessageStart: jest.fn(),
      emitMessageChunk: jest.fn(),
      emitMessageEnd: jest.fn(),
      emitThinkingChunk: jest.fn(),
      emitToolStart: jest.fn(),
      emitToolResult: jest.fn(),
      emitSessionStatusChanged: jest.fn(),
      emitSessionError: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentRunnerService,
        { provide: PrismaService, useValue: prismaService },
        { provide: LlmGatewayService, useValue: llmGateway },
        { provide: SESSION_EVENT_EMITTER, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<AgentRunnerService>(AgentRunnerService);
  });

  it('должен быть определён', () => {
    expect(service).toBeDefined();
  });

  describe('runAgent — базовый flow', () => {
    it('должен успешно стримить LLM, создать Message и обновить токены', async () => {
      const result = await service.runAgent(baseParams);

      expect(result.content).toBe('Ответ аналитика');
      expect(result.tokensInput).toBe(100);
      expect(result.tokensOutput).toBe(50);
      expect(result.costUsd).toBe(0.01);
      expect(result.messageId).toBe('msg-1');
      expect(llmGateway.chatStream).toHaveBeenCalledTimes(1);
      expect(prismaService.message.create).toHaveBeenCalledTimes(1);
      expect(prismaService.$transaction).toHaveBeenCalledTimes(1);
    });

    it('должен retry при ошибке: 1-й fail, 2-й ok', async () => {
      llmGateway.chatStream
        .mockImplementationOnce(() => {
          throw new Error('Rate limit');
        })
        .mockImplementationOnce(() => mockStream(successChunks));

      const result = await service.runAgent(baseParams);

      expect(result.content).toBe('Ответ аналитика');
      expect(llmGateway.chatStream).toHaveBeenCalledTimes(2);
    }, 10000);

    it('должен вернуть пустой результат при исчерпании попыток', async () => {
      llmGateway.chatStream.mockImplementation(() => {
        throw new Error('Error');
      });

      const result = await service.runAgent(baseParams);

      expect(result.content).toBe('');
      expect(result.tokensInput).toBe(0);
      expect(llmGateway.chatStream).toHaveBeenCalledTimes(3);
      // Пустое сообщение всё равно сохраняется
      expect(prismaService.message.create).toHaveBeenCalledTimes(1);
    }, 15000);

    it('должен использовать $transaction для increment токенов агента и сессии', async () => {
      await service.runAgent(baseParams);

      expect(prismaService.$transaction).toHaveBeenCalledWith([
        expect.anything(), // agent.update
        expect.anything(), // session.update
      ]);
    });
  });

  describe('runAgent — стриминг событий', () => {
    it('должен эмитить message:start перед стримингом', async () => {
      await service.runAgent(baseParams);

      expect(eventEmitter.emitMessageStart).toHaveBeenCalledWith('session-1', {
        messageId: expect.any(String),
        agentId: 'agent-1',
        agentName: 'Аналитик 1',
        agentRole: 'ANALYST',
        roundId: 'round-1',
      });
    });

    it('должен эмитить message:chunk для каждого текстового чанка', async () => {
      llmGateway.chatStream.mockImplementation(() =>
        mockStream([
          { type: 'text', text: 'Привет' },
          { type: 'text', text: ' мир' },
          { type: 'done', usage: { tokensInput: 10, tokensOutput: 5, costUsd: 0.001 } },
        ]),
      );

      await service.runAgent(baseParams);

      expect(eventEmitter.emitMessageChunk).toHaveBeenCalledTimes(2);
      expect(eventEmitter.emitMessageChunk).toHaveBeenNthCalledWith(1, 'session-1', {
        messageId: expect.any(String),
        chunk: 'Привет',
      });
      expect(eventEmitter.emitMessageChunk).toHaveBeenNthCalledWith(2, 'session-1', {
        messageId: expect.any(String),
        chunk: ' мир',
      });
    });

    it('должен эмитить message:end с итоговыми метриками', async () => {
      await service.runAgent(baseParams);

      expect(eventEmitter.emitMessageEnd).toHaveBeenCalledWith('session-1', {
        messageId: expect.any(String),
        tokensInput: 100,
        tokensOutput: 50,
        costUsd: 0.01,
        latencyMs: expect.any(Number),
      });
    });

    it('должен использовать одинаковый messageId во всех событиях и в БД', async () => {
      let capturedMessageId: string | undefined;

      eventEmitter.emitMessageStart.mockImplementation(
        (_sid: string, event: { messageId: string }) => {
          capturedMessageId = event.messageId;
        },
      );

      await service.runAgent(baseParams);

      expect(capturedMessageId).toBeDefined();
      expect(eventEmitter.emitMessageEnd).toHaveBeenCalledWith(
        'session-1',
        expect.objectContaining({ messageId: capturedMessageId }),
      );
      expect(prismaService.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ id: capturedMessageId }),
        }),
      );
    });
  });

  describe('runAgent — tool call loop', () => {
    it('должен gracefully обработать unknown tool_call и продолжать loop до финального ответа', async () => {
      llmGateway.chatStream
        .mockImplementationOnce(() =>
          mockStream([
            {
              type: 'tool_call',
              toolCall: {
                id: 'tc-1',
                type: 'function',
                function: { name: 'unknown_tool', arguments: '{"query":"SaaS market"}' },
              },
            },
            { type: 'done', usage: { tokensInput: 50, tokensOutput: 20, costUsd: 0.005 } },
          ]),
        )
        .mockImplementationOnce(() =>
          mockStream([
            { type: 'text', text: 'Финальный ответ' },
            { type: 'done', usage: { tokensInput: 80, tokensOutput: 40, costUsd: 0.008 } },
          ]),
        );

      const result = await service.runAgent(baseParams);

      expect(result.content).toBe('Финальный ответ');
      // 2 стрим-вызова: tool_call + финальный ответ
      expect(llmGateway.chatStream).toHaveBeenCalledTimes(2);
      // tool call записан в результат (через default case)
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].tool).toBe('unknown_tool');
    });

    it('должен эмитить ToolStart и ToolResult события', async () => {
      llmGateway.chatStream
        .mockImplementationOnce(() =>
          mockStream([
            {
              type: 'tool_call',
              toolCall: {
                id: 'tc-1',
                type: 'function',
                function: { name: 'unknown_tool', arguments: '{"query":"test"}' },
              },
            },
            { type: 'done', usage: { tokensInput: 50, tokensOutput: 20, costUsd: 0.005 } },
          ]),
        )
        .mockImplementationOnce(() => mockStream(successChunks));

      await service.runAgent(baseParams);

      expect(eventEmitter.emitToolStart).toHaveBeenCalledWith('session-1', {
        messageId: expect.any(String),
        agentId: 'agent-1',
        toolName: 'unknown_tool',
        query: 'test',
      });
      expect(eventEmitter.emitToolResult).toHaveBeenCalledWith('session-1', {
        messageId: expect.any(String),
        agentId: 'agent-1',
        toolName: 'unknown_tool',
        result: 'Неизвестная тулза: unknown_tool',
      });
    });

    it('должен суммировать токены по всем вызовам в tool loop', async () => {
      llmGateway.chatStream
        .mockImplementationOnce(() =>
          mockStream([
            {
              type: 'tool_call',
              toolCall: {
                id: 'tc-1',
                type: 'function',
                function: { name: 'unknown_tool', arguments: '{"query":"test"}' },
              },
            },
            { type: 'done', usage: { tokensInput: 50, tokensOutput: 20, costUsd: 0.005 } },
          ]),
        )
        .mockImplementationOnce(() =>
          mockStream([
            { type: 'text', text: 'Финал' },
            { type: 'done', usage: { tokensInput: 80, tokensOutput: 40, costUsd: 0.008 } },
          ]),
        );

      const result = await service.runAgent(baseParams);

      // Суммарно: 50+80 = 130 input, 20+40 = 60 output
      expect(result.tokensInput).toBe(130);
      expect(result.tokensOutput).toBe(60);
    });

    it('должен остановить loop при MAX_TOOL_CALLS_PER_TURN итерациях', async () => {
      llmGateway.chatStream.mockImplementation(() =>
        mockStream([
          {
            type: 'tool_call',
            toolCall: {
              id: 'tc-1',
              type: 'function',
              function: { name: 'unknown_tool', arguments: '{"query":"test"}' },
            },
          },
          { type: 'done', usage: { tokensInput: 10, tokensOutput: 5, costUsd: 0.001 } },
        ]),
      );

      await service.runAgent(baseParams);

      // MAX_TOOL_CALLS_PER_TURN = 5
      expect(llmGateway.chatStream).toHaveBeenCalledTimes(5);
    });
  });

  describe('runAgent — call_researcher', () => {
    const directorParams = {
      ...baseParams,
      agent: mockDirectorAgent,
      session: { ...mockSession },
    };

    it('должен вызвать Perplexity через call_researcher (не стриминг)', async () => {
      llmGateway.chatStream
        .mockImplementationOnce(() =>
          mockStream([
            {
              type: 'tool_call',
              toolCall: {
                id: 'tc-1',
                type: 'function',
                function: { name: 'call_researcher', arguments: '{"query":"конкуренты SaaS"}' },
              },
            },
            { type: 'done', usage: { tokensInput: 50, tokensOutput: 20, costUsd: 0.005 } },
          ]),
        )
        .mockImplementationOnce(() =>
          mockStream([
            { type: 'text', text: 'Финальный ответ директора' },
            { type: 'done', usage: { tokensInput: 80, tokensOutput: 40, costUsd: 0.008 } },
          ]),
        );

      await service.runAgent(directorParams);

      // callResearcher использует llmGateway.chat (не streaming)
      expect(llmGateway.chat).toHaveBeenCalledTimes(1);
      // Директор сделал 2 streaming-вызова
      expect(llmGateway.chatStream).toHaveBeenCalledTimes(2);
      // researchCallsUsed инкрементирован в БД
      expect(prismaService.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { researchCallsUsed: { increment: 1 } },
        }),
      );
    });

    it('должен вернуть RESEARCH_LIMIT_REACHED_MESSAGE при исчерпании лимита', async () => {
      const paramsAtLimit = {
        ...directorParams,
        session: { ...mockSession, researchCallsUsed: 3, maxResearchCalls: 3 },
      };

      llmGateway.chatStream
        .mockImplementationOnce(() =>
          mockStream([
            {
              type: 'tool_call',
              toolCall: {
                id: 'tc-1',
                type: 'function',
                function: { name: 'call_researcher', arguments: '{"query":"test"}' },
              },
            },
            { type: 'done', usage: { tokensInput: 50, tokensOutput: 20, costUsd: 0.005 } },
          ]),
        )
        .mockImplementationOnce(() => mockStream(successChunks));

      const result = await service.runAgent(paramsAtLimit);

      // Tool result должен содержать сообщение о лимите
      expect(result.toolCalls[0].result).toBe(RESEARCH_LIMIT_REACHED_MESSAGE);
      // Ресерчер НЕ вызывался
      expect(llmGateway.chat).not.toHaveBeenCalled();
    });

    it('должен вернуть ошибку если ресерчер не назначен в сессии', async () => {
      const paramsNoResearcher = {
        ...directorParams,
        session: {
          ...mockSession,
          agents: [mockDirectorAgent, mockAgent], // без ресерчера
        },
      };

      llmGateway.chatStream
        .mockImplementationOnce(() =>
          mockStream([
            {
              type: 'tool_call',
              toolCall: {
                id: 'tc-1',
                type: 'function',
                function: { name: 'call_researcher', arguments: '{"query":"test"}' },
              },
            },
            { type: 'done', usage: { tokensInput: 50, tokensOutput: 20, costUsd: 0.005 } },
          ]),
        )
        .mockImplementationOnce(() => mockStream(successChunks));

      const result = await service.runAgent(paramsNoResearcher);

      expect(result.toolCalls[0].result).toContain('Ресерчер не назначен');
    });
  });

  describe('runAgent — reasoning/thinking chunks', () => {
    it('должен эмитить thinking:chunk для reasoning чанков', async () => {
      llmGateway.chatStream.mockImplementation(() =>
        mockStream([
          { type: 'reasoning', reasoning: 'Думаю о решении...' },
          { type: 'reasoning', reasoning: 'Нашёл ответ.' },
          { type: 'text', text: 'Вот мой ответ' },
          { type: 'done', usage: { tokensInput: 200, tokensOutput: 80, costUsd: 0.02 } },
        ]),
      );

      await service.runAgent(baseParams);

      expect(eventEmitter.emitThinkingChunk).toHaveBeenCalledTimes(2);
      expect(eventEmitter.emitThinkingChunk).toHaveBeenNthCalledWith(1, 'session-1', {
        messageId: expect.any(String),
        thinking: 'Думаю о решении...',
      });
      expect(eventEmitter.emitThinkingChunk).toHaveBeenNthCalledWith(2, 'session-1', {
        messageId: expect.any(String),
        thinking: 'Нашёл ответ.',
      });
    });

    it('не должен эмитить thinking:chunk если reasoning чанков нет', async () => {
      await service.runAgent(baseParams);

      expect(eventEmitter.emitThinkingChunk).not.toHaveBeenCalled();
    });

    it('должен сохранить текст сообщения несмотря на reasoning чанки', async () => {
      llmGateway.chatStream.mockImplementation(() =>
        mockStream([
          { type: 'reasoning', reasoning: 'Мысль...' },
          { type: 'text', text: 'Финальный ответ' },
          { type: 'done', usage: { tokensInput: 150, tokensOutput: 60, costUsd: 0.015 } },
        ]),
      );

      const result = await service.runAgent(baseParams);

      expect(result.content).toBe('Финальный ответ');
    });
  });

  describe('runAgent — web search annotations (OpenRouter plugin)', () => {
    it('должен эмитить emitToolResult при annotations чанке', async () => {
      llmGateway.chatStream.mockImplementation(() =>
        mockStream([
          { type: 'text', text: 'Ответ с веб-поиском' },
          {
            type: 'annotations',
            annotations: [
              { url: 'https://example.com', title: 'Example Site', content: 'Описание страницы' },
              { url: 'https://another.com', title: 'Another Site' },
            ],
          },
          { type: 'done', usage: { tokensInput: 100, tokensOutput: 50, costUsd: 0.01 } },
        ]),
      );

      await service.runAgent(baseParams);

      expect(eventEmitter.emitToolResult).toHaveBeenCalledWith('session-1', {
        messageId: expect.any(String),
        agentId: 'agent-1',
        toolName: 'web_search',
        result: expect.stringContaining('Example Site'),
      });
    });

    it('должен сохранить tool call в результате при annotations', async () => {
      llmGateway.chatStream.mockImplementation(() =>
        mockStream([
          { type: 'text', text: 'Ответ' },
          {
            type: 'annotations',
            annotations: [{ url: 'https://test.com', title: 'Test' }],
          },
          { type: 'done', usage: { tokensInput: 80, tokensOutput: 40, costUsd: 0.008 } },
        ]),
      );

      const result = await service.runAgent(baseParams);

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].tool).toBe('web_search');
      expect(result.toolCalls[0].query).toBe('openrouter:web_plugin');
    });

    it('НЕ должен эмитить emitToolResult если annotations отсутствуют', async () => {
      await service.runAgent(baseParams);

      expect(eventEmitter.emitToolResult).not.toHaveBeenCalled();
    });
  });

  describe('buildToolDefinitions', () => {
    it('должен вернуть пустой массив для аналитика (web_search через OpenRouter plugin)', () => {
      const tools = service.buildToolDefinitions(mockAgent, false);

      expect(tools).toHaveLength(0);
    });

    it('должен включать только call_researcher для Директора', () => {
      const tools = service.buildToolDefinitions(mockDirectorAgent, true);

      expect(tools).toHaveLength(1);
      expect(tools[0].function.name).toBe('call_researcher');
    });

    it('должен вернуть пустой массив если не Директор', () => {
      const agentWithoutSearch = { ...mockAgent, webSearchEnabled: false } as Agent;
      const tools = service.buildToolDefinitions(agentWithoutSearch, false);

      expect(tools).toHaveLength(0);
    });

    it('должен включать только call_researcher для Директора без webSearch', () => {
      const directorNoSearch = {
        ...mockDirectorAgent,
        webSearchEnabled: false,
      } as Agent;
      const tools = service.buildToolDefinitions(directorNoSearch, true);

      expect(tools).toHaveLength(1);
      expect(tools[0].function.name).toBe('call_researcher');
    });
  });

  describe('timeout', () => {
    it('должен вернуть пустой результат если стрим бросает ошибку таймаута', async () => {
      llmGateway.chatStream.mockImplementation(() => {
        throw new Error(AGENT_TIMEOUT_ERROR);
      });

      const result = await service.runAgent(baseParams);

      // После 3 попыток с таймаутом — пустой результат
      expect(result.content).toBe('');
      // Все 3 попытки были сделаны
      expect(llmGateway.chatStream).toHaveBeenCalledTimes(3);
    }, 15000);
  });

  describe('ошибки Директора', () => {
    it('должен поставить сессию на паузу и отправить ошибку после исчерпания retry', async () => {
      llmGateway.chatStream.mockImplementation(() => {
        throw new Error('Director timeout');
      });

      await service.runAgent({
        ...baseParams,
        agent: mockDirectorAgent,
      });

      expect(prismaService.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'PAUSED' },
        }),
      );
      expect(eventEmitter.emitSessionStatusChanged).toHaveBeenCalledWith(
        'session-1',
        expect.objectContaining({ status: 'PAUSED' }),
      );
      expect(eventEmitter.emitSessionError).toHaveBeenCalledWith(
        'session-1',
        expect.stringContaining('Директор'),
        'director-1',
      );
    }, 15000);
  });
});
