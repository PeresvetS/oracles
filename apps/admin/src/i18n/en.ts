/** Структура локали */
export interface I18nKeys {
  common: {
    login: string;
    logout: string;
    sessions: string;
    loading: string;
    error: string;
    save: string;
    cancel: string;
    delete: string;
    edit: string;
    create: string;
    confirm: string;
    tryAgain: string;
    back: string;
    admin: string;
    settings: string;
    prompts: string;
    models: string;
  };
  auth: {
    emailLabel: string;
    emailPlaceholder: string;
    passwordLabel: string;
    passwordPlaceholder: string;
    loginButton: string;
    loginTitle: string;
    loginSubtitle: string;
    loginError: string;
    loginSuccess: string;
  };
  sessions: {
    title: string;
    newSession: string;
    noSessions: string;
    noSessionsHint: string;
    createFirst: string;
    roundsLabel: string;
    costLabel: string;
    ideasLabel: string;
    statusAll: string;
    statusRunning: string;
    statusPaused: string;
    statusCompleted: string;
    statusConfiguring: string;
    statusError: string;
  };
  session: {
    chatTab: string;
    reportTab: string;
    pauseButton: string;
    resumeButton: string;
    stopButton: string;
    roundsIndicator: string;
    addRounds: string;
    sendMessage: string;
    messagePlaceholder: string;
    thinking: string;
    roundInitial: string;
    roundDiscussion: string;
    roundResearch: string;
    roundScoring: string;
    roundUserInitiated: string;
    roundFinal: string;
    webSearch: string;
    callResearcher: string;
    toolResult: string;
    toolLoading: string;
    stopConfirmMessage: string;
    stopFinalizeInstruction: string;
    connected: string;
    disconnected: string;
    reconnecting: string;
    addRoundsDialogTitle: string;
    addRoundsDialogDesc: string;
    addRoundsDialogNewValue: string;
    addRoundsConfirm: string;
  };
  sessionForm: {
    title: string;
    nameLabel: string;
    namePlaceholder: string;
    modeLabel: string;
    modeGenerate: string;
    modeGenerateDesc: string;
    modeValidate: string;
    modeValidateDesc: string;
    promptLabel: string;
    promptPlaceholder: string;
    existingIdeas: string;
    existingIdeasPlaceholder: string;
    agents: string;
    addAnalyst: string;
    removeAgent: string;
    agentName: string;
    agentNamePlaceholder: string;
    agentRole: string;
    agentModel: string;
    agentPrompt: string;
    webSearchEnabled: string;
    filters: string;
    complexity: string;
    budget: string;
    budgetPlaceholder: string;
    timeToRevenue: string;
    marketSize: string;
    legalRisk: string;
    requireCompetitors: string;
    operabilityCheck: string;
    limits: string;
    maxRoundsLabel: string;
    maxRoundsHint: string;
    maxResearchCalls: string;
    createSession: string;
    creating: string;
    directorSection: string;
    analystSection: string;
    researcherSection: string;
    apiKeyNotConfigured: string;
    promptTemplateCustom: string;
    promptTemplateDefault: string;
    hidePromptEditor: string;
    anyOption: string;
    submitButton: string;
    submitting: string;
    agentsNote: string;
    createdSuccess: string;
  };
  report: {
    title: string;
    noReport: string;
    ideas: string;
    rejectedIdeas: string;
    exportCsv: string;
    exportJson: string;
    ideaName: string;
    iceAvg: string;
    riceAvg: string;
    budget: string;
    timeToRevenue: string;
    description: string;
    implementation: string;
    competitors: string;
    risks: string;
    opportunities: string;
    unitEconomics: string;
    cac: string;
    ltv: string;
    paybackPeriod: string;
    analystScores: string;
    ice: string;
    rice: string;
    impact: string;
    confidence: string;
    ease: string;
    reach: string;
    agentColumn: string;
    rejectedReason: string;
    rejectedRound: string;
    loadingReport: string;
    errorReport: string;
  };
  errors: {
    unauthorized: string;
    networkError: string;
    sessionNotFound: string;
    generic: string;
  };
  /** Навигация сайдбара */
  nav: {
    sessions: string;
    admin: string;
    adminTitle: string;
    prompts: string;
    models: string;
    menuToggle: string;
  };
  /** Страницы администрирования */
  admin: {
    apiKeysTitle: string;
    apiKeysSaved: string;
    apiKeysSaveError: string;
    openrouterKey: string;
    perplexityKey: string;
    serperKey: string;
    anthropicKey: string;
    openaiKey: string;
    googleKey: string;
    keyPlaceholder: string;
    saveKey: string;
    defaultSettings: string;
    defaultMaxRounds: string;
    defaultAnalystCount: string;
    promptsTitle: string;
    promptsEmpty: string;
    promptsCreate: string;
    promptName: string;
    promptRole: string;
    promptModel: string;
    promptModelPlaceholder: string;
    promptContent: string;
    promptIsDefault: string;
    promptEditTitle: string;
    promptCreateTitle: string;
    promptDeleted: string;
    promptDeleteConfirm: string;
    filterRole: string;
    filterModel: string;
    filterAll: string;
    modelsTitle: string;
    modelsEmpty: string;
    modelContext: string;
    modelPriceIn: string;
    modelPriceOut: string;
    modelAvailable: string;
    modelUnavailable: string;
    currentMaskedValue: string;
    roleDirector: string;
    roleAnalyst: string;
    roleResearcher: string;
    defaultBadge: string;
    modelHeaderName: string;
    modelHeaderFamily: string;
    modelHeaderProvider: string;
    modelHeaderStatus: string;
    promptSaveSuccess: string;
    promptCreateSuccess: string;
    promptSaveError: string;
  };
  /** Переключатель темы */
  theme: {
    toggle: string;
    light: string;
    dark: string;
  };
}

/** Английская локаль */
export const en: I18nKeys = {
  common: {
    login: 'Login',
    logout: 'Logout',
    sessions: 'Sessions',
    loading: 'Loading...',
    error: 'An error occurred',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    create: 'Create',
    confirm: 'Confirm',
    tryAgain: 'Try again',
    back: 'Back',
    admin: 'Admin',
    settings: 'Settings',
    prompts: 'Prompts',
    models: 'Models',
  },
  auth: {
    emailLabel: 'Email',
    emailPlaceholder: 'admin@besales.app',
    passwordLabel: 'Password',
    passwordPlaceholder: '••••••••',
    loginButton: 'Sign in',
    loginTitle: 'Oracle',
    loginSubtitle: 'Sign in to your account',
    loginError: 'Invalid email or password',
    loginSuccess: 'Welcome back!',
  },
  sessions: {
    title: 'Sessions',
    newSession: '+ New session',
    noSessions: 'No sessions yet',
    noSessionsHint: 'Create your first session to start generating ideas',
    createFirst: 'Create session',
    roundsLabel: 'Round',
    costLabel: 'Cost',
    ideasLabel: 'ideas',
    statusAll: 'All',
    statusRunning: 'Running',
    statusPaused: 'Paused',
    statusCompleted: 'Completed',
    statusConfiguring: 'Configuring',
    statusError: 'Error',
  },
  session: {
    chatTab: 'Chat',
    reportTab: 'Report',
    pauseButton: 'Pause',
    resumeButton: 'Resume',
    stopButton: 'Stop',
    roundsIndicator: 'Round',
    addRounds: 'Add rounds',
    sendMessage: 'Send',
    messagePlaceholder: 'Write a message to agents...',
    thinking: 'thinking...',
    roundInitial: 'Initial',
    roundDiscussion: 'Discussion',
    roundResearch: 'Research',
    roundScoring: 'Scoring',
    roundUserInitiated: 'User Message',
    roundFinal: 'Final',
    webSearch: 'Web Search',
    callResearcher: 'Researcher',
    toolResult: 'Result',
    toolLoading: 'Loading...',
    stopConfirmMessage: 'The current agent will finish, then the session will be paused.',
    stopFinalizeInstruction:
      'User requested to stop. Finalize discussion, prepare final report and complete session.',
    connected: 'Connected',
    disconnected: 'Disconnected',
    reconnecting: 'Reconnecting...',
    addRoundsDialogTitle: 'Increase rounds limit',
    addRoundsDialogDesc: 'Set the new maximum number of rounds for this session.',
    addRoundsDialogNewValue: 'New rounds limit',
    addRoundsConfirm: 'Confirm',
  },
  sessionForm: {
    title: 'New session',
    nameLabel: 'Name (optional)',
    namePlaceholder: 'e.g. SaaS Ideas 2026',
    modeLabel: 'Mode',
    modeGenerate: 'Generate',
    modeGenerateDesc: 'Analysts generate ideas from scratch',
    modeValidate: 'Validate',
    modeValidateDesc: 'Analysts analyze existing ideas',
    promptLabel: 'Task description',
    promptPlaceholder: 'Describe the business domain, goals, constraints...',
    existingIdeas: 'Existing ideas',
    existingIdeasPlaceholder: 'List the ideas you want to analyze, one per line...',
    agents: 'Agents',
    addAnalyst: '+ Add analyst',
    removeAgent: 'Remove',
    agentName: 'Name',
    agentNamePlaceholder: 'e.g. Analyst 1',
    agentRole: 'Role',
    agentModel: 'Model',
    agentPrompt: 'System prompt',
    webSearchEnabled: 'Web search',
    filters: 'Filters',
    complexity: 'Complexity',
    budget: 'Budget',
    budgetPlaceholder: 'e.g. $10,000',
    timeToRevenue: 'Time to revenue',
    marketSize: 'Market size',
    legalRisk: 'Legal risk',
    requireCompetitors: 'Require competitor analysis',
    operabilityCheck: 'Operability check',
    limits: 'Limits',
    maxRoundsLabel: 'Max rounds',
    maxRoundsHint: 'From 1 to 15',
    maxResearchCalls: 'Max research calls',
    createSession: 'Create session',
    creating: 'Creating...',
    directorSection: 'Director',
    analystSection: 'Analysts',
    researcherSection: 'Researcher',
    apiKeyNotConfigured: 'API key not configured',
    promptTemplateCustom: 'Custom',
    promptTemplateDefault: 'default',
    hidePromptEditor: 'Hide editor',
    anyOption: 'Any',
    submitButton: 'Launch session →',
    submitting: 'Creating...',
    agentsNote: 'Agents configured with default models.',
    createdSuccess: 'Session created',
  },
  report: {
    title: 'Report',
    noReport: 'The report will be available after the session is completed.',
    ideas: 'Final ideas',
    rejectedIdeas: 'Rejected ideas',
    exportCsv: 'Download CSV',
    exportJson: 'Download JSON',
    ideaName: 'Idea',
    iceAvg: 'ICE avg',
    riceAvg: 'RICE avg',
    budget: 'Budget',
    timeToRevenue: 'Time to revenue',
    description: 'Description',
    implementation: 'Implementation',
    competitors: 'Competitors',
    risks: 'Risks',
    opportunities: 'Opportunities',
    unitEconomics: 'Unit economics',
    cac: 'CAC',
    ltv: 'LTV',
    paybackPeriod: 'Payback period',
    analystScores: 'Analyst scores',
    ice: 'ICE',
    rice: 'RICE',
    impact: 'Impact',
    confidence: 'Confidence',
    ease: 'Ease',
    reach: 'Reach',
    agentColumn: 'Agent',
    rejectedReason: 'Reason',
    rejectedRound: 'Round',
    loadingReport: 'Loading report...',
    errorReport: 'Failed to load report.',
  },
  errors: {
    unauthorized: 'Unauthorized. Please sign in.',
    networkError: 'Network error. Check your connection.',
    sessionNotFound: 'Session not found.',
    generic: 'Something went wrong.',
  },
  nav: {
    sessions: 'Sessions',
    admin: 'API Keys',
    adminTitle: 'Administration',
    prompts: 'Prompts',
    models: 'Models',
    menuToggle: 'Toggle menu',
  },
  admin: {
    apiKeysTitle: 'API Keys',
    apiKeysSaved: 'Key saved successfully',
    apiKeysSaveError: 'Failed to save key',
    openrouterKey: 'OpenRouter API Key',
    perplexityKey: 'Perplexity API Key',
    serperKey: 'Serper API Key',
    anthropicKey: 'Anthropic API Key',
    openaiKey: 'OpenAI API Key',
    googleKey: 'Google API Key',
    keyPlaceholder: 'Paste key or leave unchanged',
    saveKey: 'Save',
    defaultSettings: 'Default Settings',
    defaultMaxRounds: 'Default max rounds',
    defaultAnalystCount: 'Default analyst count',
    promptsTitle: 'Prompt Templates',
    promptsEmpty: 'No prompt templates yet',
    promptsCreate: 'Create Template',
    promptName: 'Name',
    promptRole: 'Role',
    promptModel: 'Model (optional)',
    promptModelPlaceholder: 'e.g. anthropic/claude-sonnet-4-6',
    promptContent: 'Content',
    promptIsDefault: 'Default template for this role/model',
    promptEditTitle: 'Edit Template',
    promptCreateTitle: 'Create Template',
    promptDeleted: 'Template deleted',
    promptDeleteConfirm: 'Delete this template?',
    filterRole: 'Filter by role',
    filterModel: 'Filter by model',
    filterAll: 'All',
    modelsTitle: 'Models',
    modelsEmpty: 'No models configured',
    modelContext: 'Context',
    modelPriceIn: 'Price/1K in',
    modelPriceOut: 'Price/1K out',
    modelAvailable: 'Available',
    modelUnavailable: 'No API key',
    currentMaskedValue: 'Current',
    roleDirector: 'Director',
    roleAnalyst: 'Analyst',
    roleResearcher: 'Researcher',
    defaultBadge: 'Default',
    modelHeaderName: 'Name',
    modelHeaderFamily: 'Family',
    modelHeaderProvider: 'Provider',
    modelHeaderStatus: 'Status',
    promptSaveSuccess: 'Template saved',
    promptCreateSuccess: 'Template created',
    promptSaveError: 'Failed to save template',
  },
  theme: {
    toggle: 'Toggle theme',
    light: 'Light',
    dark: 'Dark',
  },
};
