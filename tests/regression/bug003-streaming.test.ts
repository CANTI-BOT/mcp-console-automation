/**
 * Regression test for BUG-003: get_stream reports "Streaming not enabled"
 * even when session was created with streaming: true.
 *
 * Root cause: createSessionInternal (protocol-factory path) never registered
 * a StreamManager in this.streamManagers, so getStream() always returned
 * undefined.  handleProtocolOutput also didn't push chunks to the stream.
 */

import { ConsoleManager } from '../../src/core/ConsoleManager.js';
import { ProtocolFactory, IProtocol } from '../../src/core/ProtocolFactory.js';
import { StreamManager } from '../../src/core/StreamManager.js';

// ── Mock heavy dependencies ──────────────────────────────────────────────────
jest.mock('../../src/core/ProtocolFactory.js');
jest.mock('../../src/core/SessionManager.js');
jest.mock('../../src/core/ErrorDetector.js');
jest.mock('../../src/utils/logger.js');
jest.mock('../../src/core/StreamManager.js');
jest.mock('../../src/core/PromptDetector.js');
jest.mock('../../src/core/ConnectionPool.js');
jest.mock('../../src/core/RetryManager.js');
jest.mock('../../src/core/ErrorRecovery.js');
jest.mock('../../src/core/HealthMonitor.js');
jest.mock('../../src/core/HeartbeatMonitor.js');
jest.mock('../../src/core/SessionRecovery.js');
jest.mock('../../src/core/MetricsCollector.js');
jest.mock('../../src/core/OutputPaginationManager.js');
jest.mock('../../src/monitoring/AzureMonitoring.js');
jest.mock('../../src/core/OutputFilterEngine.js');
jest.mock('../../src/core/HealthOrchestrator.js');
jest.mock('../../src/core/DiagnosticsManager.js', () => ({
  DiagnosticsManager: {
    getInstance: jest.fn<any>().mockReturnValue({
      recordEvent: jest.fn<any>(),
      destroy: jest.fn<any>(),
      startMetricsCollection: jest.fn<any>(),
    }),
  },
}));
jest.mock('../../src/config/ConfigManager.js', () => ({
  ConfigManager: {
    getInstance: jest.fn<any>().mockReturnValue({
      getConfigPath: jest.fn<any>().mockReturnValue('/tmp/test-config'),
      get: jest.fn<any>(),
      set: jest.fn<any>(),
      getConnectionProfile: jest.fn<any>(),
      getApplicationProfileByType: jest.fn<any>().mockReturnValue(null),
      destroy: jest.fn<any>(),
    }),
  },
}));
jest.mock('../../src/protocols/DockerProtocol.js');
jest.mock('../../src/core/NetworkMetricsManager.js');
jest.mock('../../src/core/SessionPersistenceManager.js');
jest.mock('../../src/core/CommandQueueManager.js');
jest.mock('../../src/core/SessionValidator.js');
jest.mock('../../src/core/SSHConnectionKeepAlive.js');

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildMockProtocol(): jest.Mocked<IProtocol> {
  return {
    type: 'bash' as any,
    capabilities: {
      supportsStreaming: true,
      supportsFileTransfer: false,
      supportsX11Forwarding: false,
      supportsPortForwarding: false,
      supportsAuthentication: false,
      supportsEncryption: false,
      supportsCompression: false,
      supportsMultiplexing: false,
      supportsKeepAlive: false,
      supportsReconnection: false,
      supportsBinaryData: false,
      supportsCustomEnvironment: true,
      supportsWorkingDirectory: true,
      supportsSignals: true,
      supportsResizing: false,
      supportsPTY: false,
      maxConcurrentSessions: 10,
      defaultTimeout: 30000,
      supportedEncodings: [],
      supportedAuthMethods: [],
      platformSupport: { windows: true, linux: true, macos: true, freebsd: true },
    },
    healthStatus: {
      isHealthy: true,
      lastChecked: new Date(),
      errors: [],
      warnings: [],
      metrics: { activeSessions: 0, totalSessions: 0, averageLatency: 0, successRate: 1, uptime: 0 },
      dependencies: {},
    },
    initialize: jest.fn<any>().mockResolvedValue(undefined),
    createSession: jest.fn<any>().mockResolvedValue({
      id: 'proto-session-id',
      type: 'bash',
      status: 'active',
      createdAt: new Date(),
      lastActivity: new Date(),
    }),
    executeCommand: jest.fn<any>().mockResolvedValue(undefined),
    sendInput: jest.fn<any>().mockResolvedValue(undefined),
    getOutput: jest.fn<any>().mockResolvedValue(''),
    closeSession: jest.fn<any>().mockResolvedValue(undefined),
    getHealthStatus: jest.fn<any>().mockResolvedValue({ isHealthy: true }),
    dispose: jest.fn<any>().mockResolvedValue(undefined),
    on: jest.fn<any>(),
    off: jest.fn<any>(),
    emit: jest.fn<any>(),
    removeAllListeners: jest.fn<any>(),
    addListener: jest.fn<any>(),
    once: jest.fn<any>(),
    removeListener: jest.fn<any>(),
    setMaxListeners: jest.fn<any>(),
    getMaxListeners: jest.fn<any>(),
    listeners: jest.fn<any>(),
    rawListeners: jest.fn<any>(),
    listenerCount: jest.fn<any>(),
    prependListener: jest.fn<any>(),
    prependOnceListener: jest.fn<any>(),
    eventNames: jest.fn<any>(),
  } as jest.Mocked<IProtocol>;
}

function buildConsoleManager(mockProtocol: jest.Mocked<IProtocol>): ConsoleManager {
  const mockProtocolFactory = {
    createProtocol: jest.fn<any>().mockResolvedValue(mockProtocol),
    getOverallHealthStatus: jest.fn<any>().mockResolvedValue({}),
    dispose: jest.fn<any>().mockResolvedValue(undefined),
    on: jest.fn<any>(),
    off: jest.fn<any>(),
    emit: jest.fn<any>(),
    removeAllListeners: jest.fn<any>(),
  } as any;

  jest.useFakeTimers();
  const cm = new ConsoleManager();

  // Wire in mocked internals (same pattern as ConsoleManager.test.ts)
  (cm as any).protocolFactory = mockProtocolFactory;
  (cm as any).sessionManager = {
    initialize: jest.fn<any>().mockResolvedValue(undefined),
    registerSession: jest.fn<any>().mockResolvedValue(undefined),
    updateSessionStatus: jest.fn<any>().mockResolvedValue(undefined),
    unregisterSession: jest.fn<any>().mockResolvedValue(undefined),
    shutdown: jest.fn<any>().mockResolvedValue(undefined),
    destroy: jest.fn<any>().mockResolvedValue(undefined),
  };
  (cm as any).configManager = {
    getConfigPath: jest.fn<any>().mockReturnValue('/tmp/test-config'),
    get: jest.fn<any>(),
    set: jest.fn<any>(),
    getConnectionProfile: jest.fn<any>(),
    getApplicationProfileByType: jest.fn<any>().mockReturnValue(null),
    destroy: jest.fn<any>(),
  };
  (cm as any).errorDetector = { initialize: jest.fn<any>().mockResolvedValue(undefined) };
  (cm as any).streamManager = { initialize: jest.fn<any>().mockResolvedValue(undefined) };
  (cm as any).promptDetector = { initialize: jest.fn<any>().mockResolvedValue(undefined) };
  (cm as any).connectionPool = {
    initialize: jest.fn<any>().mockResolvedValue(undefined),
    shutdown: jest.fn<any>().mockResolvedValue(undefined),
  };
  (cm as any).retryManager = {
    initialize: jest.fn<any>().mockResolvedValue(undefined),
    executeWithRetry: jest.fn<any>().mockImplementation(async (fn: any) => fn()),
    destroy: jest.fn<any>(),
  };
  (cm as any).errorRecovery = {
    initialize: jest.fn<any>().mockResolvedValue(undefined),
    destroy: jest.fn<any>(),
  };
  (cm as any).diagnosticsManager = {
    recordEvent: jest.fn<any>(),
    destroy: jest.fn<any>(),
  };
  (cm as any).healthOrchestrator = {
    initialize: jest.fn<any>().mockResolvedValue(undefined),
    destroy: jest.fn<any>().mockResolvedValue(undefined),
    start: jest.fn<any>(),
    stop: jest.fn<any>(),
    getHealthMonitor: jest.fn<any>().mockReturnValue({
      initialize: jest.fn<any>().mockResolvedValue(undefined),
      start: jest.fn<any>(),
      stop: jest.fn<any>(),
      once: jest.fn<any>(),
      destroy: jest.fn<any>(),
    }),
    getHeartbeatMonitor: jest.fn<any>().mockReturnValue({
      initialize: jest.fn<any>().mockResolvedValue(undefined),
      getSessionHeartbeat: jest.fn<any>().mockReturnValue(null),
    }),
    getSessionRecovery: jest.fn<any>().mockReturnValue({
      initialize: jest.fn<any>().mockResolvedValue(undefined),
    }),
    getMetricsCollector: jest.fn<any>().mockReturnValue({
      initialize: jest.fn<any>().mockResolvedValue(undefined),
      getMetrics: jest.fn<any>().mockResolvedValue({}),
      getCurrentMetrics: jest.fn<any>().mockReturnValue({}),
    }),
    getSSHKeepAlive: jest.fn<any>().mockReturnValue({
      getConnectionHealth: jest.fn<any>().mockReturnValue({}),
    }),
    getHealingStats: jest.fn<any>().mockReturnValue({}),
  };
  (cm as any).logger = {
    info: jest.fn<any>(),
    error: jest.fn<any>(),
    warn: jest.fn<any>(),
    debug: jest.fn<any>(),
  };
  (cm as any).sessions = new Map();
  (cm as any).sessionProtocols = new Map();
  (cm as any).maxSessions = 100;

  return cm;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('BUG-003: streaming property wiring', () => {
  let cm: ConsoleManager;
  let mockProtocol: jest.Mocked<IProtocol>;

  beforeEach(() => {
    mockProtocol = buildMockProtocol();
    cm = buildConsoleManager(mockProtocol);
  });

  afterEach(async () => {
    try { await cm.destroy(); } catch { /* ignore */ }
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('should register a StreamManager when session is created with streaming: true', async () => {
    const sessionId = await cm.createSession({
      command: 'bash',
      consoleType: 'bash',
      streaming: true,
    });

    // getStream() must NOT return undefined — that's what triggers the error
    const streamManager = cm.getStream(sessionId);
    expect(streamManager).toBeDefined();
  });

  it('should NOT register a StreamManager when session is created without streaming', async () => {
    const sessionId = await cm.createSession({
      command: 'bash',
      consoleType: 'bash',
      streaming: false,
    });

    // For non-streaming sessions, getStream should return undefined
    // (server.ts shows the "not enabled" error only for these)
    const streamManager = cm.getStream(sessionId);
    expect(streamManager).toBeUndefined();
  });

  it('should add output chunks to the StreamManager via handleProtocolOutput', async () => {
    const sessionId = await cm.createSession({
      command: 'bash',
      consoleType: 'bash',
      streaming: true,
    });

    const streamManager = cm.getStream(sessionId);
    expect(streamManager).toBeDefined();

    // Simulate the protocol emitting output for this session
    const protocolSessionId =
      (cm as any).protocolSessionIdMap?.get(sessionId) ?? sessionId;

    // Trigger the 'output' event handler that setupProtocolEventHandlers wired up
    const outputHandler = (mockProtocol.on as jest.Mock<any>).mock.calls.find(
      ([event]: [string]) => event === 'output'
    )?.[1];

    expect(outputHandler).toBeDefined(); // handler must have been registered

    outputHandler({
      sessionId: protocolSessionId,
      data: 'hello from protocol',
      timestamp: new Date(),
      type: 'stdout',
    });

    // StreamManager.addChunk must have been called with the output data
    expect((streamManager as any).addChunk).toHaveBeenCalledWith(
      'hello from protocol',
      false // stdout → isError = false
    );
  });
});
