/**
 * Regression tests for BUG-010 and BUG-011:
 * - BUG-011: getSystemMetrics() returned null; now returns real os data
 * - BUG-010: getDashboard() returned null; now returns aggregated metrics
 *
 * Both methods must NEVER throw — they must return partial/empty data on failure.
 */

import { ConsoleManager } from '../../src/core/ConsoleManager';

// Fake timers prevent ConsoleManager's background setInterval calls from
// blocking the Jest process (network monitors, heartbeats, etc.)
let manager: ConsoleManager;

beforeEach(() => {
  jest.useFakeTimers();
  manager = new ConsoleManager();
});

afterEach(async () => {
  jest.useRealTimers();
  try {
    await manager.cleanup();
  } catch {
    // ignore cleanup errors in tests
  }
});

describe('BUG-011: getSystemMetrics', () => {
  it('does not throw', () => {
    expect(() => manager.getSystemMetrics()).not.toThrow();
  });

  it('returns non-null object', () => {
    const metrics = manager.getSystemMetrics();
    expect(metrics).not.toBeNull();
    expect(typeof metrics).toBe('object');
  });

  it('includes cpu section with real data', () => {
    const { cpu } = manager.getSystemMetrics();
    expect(typeof cpu.cores).toBe('number');
    expect(cpu.cores).toBeGreaterThan(0);
    expect(typeof cpu.model).toBe('string');
    expect(Array.isArray(cpu.loadAvg)).toBe(true);
    expect(cpu.loadAvg).toHaveLength(3);
  });

  it('includes memory section with valid values', () => {
    const { memory } = manager.getSystemMetrics();
    expect(memory.totalMB).toBeGreaterThan(0);
    expect(memory.freeMB).toBeGreaterThanOrEqual(0);
    expect(memory.usedMB).toBeGreaterThanOrEqual(0);
    expect(memory.usagePercent).toBeGreaterThanOrEqual(0);
    expect(memory.usagePercent).toBeLessThanOrEqual(100);
    expect(memory.totalMB).toBeGreaterThanOrEqual(memory.freeMB);
  });

  it('includes process section with live data', () => {
    const { process: proc } = manager.getSystemMetrics();
    expect(proc.heapUsedMB).toBeGreaterThan(0);
    expect(proc.heapTotalMB).toBeGreaterThan(0);
    expect(proc.rssMB).toBeGreaterThan(0);
    expect(proc.uptimeSeconds).toBeGreaterThan(0);
  });

  it('includes system section with identity info', () => {
    const { system } = manager.getSystemMetrics();
    expect(typeof system.platform).toBe('string');
    expect(system.platform.length).toBeGreaterThan(0);
    expect(typeof system.hostname).toBe('string');
    expect(system.hostname.length).toBeGreaterThan(0);
    expect(system.uptimeSeconds).toBeGreaterThan(0);
  });

  it('includes ISO timestamp', () => {
    const { timestamp } = manager.getSystemMetrics();
    expect(typeof timestamp).toBe('string');
    expect(() => new Date(timestamp)).not.toThrow();
    expect(new Date(timestamp).getFullYear()).toBeGreaterThan(2020);
  });

  it('is safe to call multiple times (idempotent)', () => {
    const m1 = manager.getSystemMetrics();
    const m2 = manager.getSystemMetrics();
    expect(m1.cpu.cores).toBe(m2.cpu.cores);
    expect(m1.system.platform).toBe(m2.system.platform);
  });
});

describe('BUG-010: getDashboard', () => {
  it('does not throw', () => {
    expect(() => manager.getDashboard()).not.toThrow();
  });

  it('returns non-null object', () => {
    const dashboard = manager.getDashboard();
    expect(dashboard).not.toBeNull();
    expect(typeof dashboard).toBe('object');
  });

  it('includes system section matching getSystemMetrics shape', () => {
    const dashboard = manager.getDashboard();
    expect(typeof dashboard.system).toBe('object');
    expect(typeof dashboard.system.cpu).toBe('object');
    expect(typeof dashboard.system.memory).toBe('object');
  });

  it('includes resources section from getResourceUsage', () => {
    const dashboard = manager.getDashboard();
    expect(typeof dashboard.resources).toBe('object');
    expect(typeof dashboard.resources.sessions).toBe('number');
    expect(typeof dashboard.resources.memoryMB).toBe('number');
  });

  it('includes alerts as array', () => {
    const dashboard = manager.getDashboard();
    expect(Array.isArray(dashboard.alerts)).toBe(true);
  });

  it('includes jobs section', () => {
    const dashboard = manager.getDashboard();
    expect(typeof dashboard.jobs).toBe('object');
  });

  it('includes sessions summary with numeric counts', () => {
    const dashboard = manager.getDashboard();
    expect(typeof dashboard.sessions.total).toBe('number');
    expect(typeof dashboard.sessions.running).toBe('number');
    expect(typeof dashboard.sessions.stopped).toBe('number');
    expect(dashboard.sessions.total).toBe(
      dashboard.sessions.running + dashboard.sessions.stopped
    );
  });

  it('includes ISO timestamp', () => {
    const { timestamp } = manager.getDashboard();
    expect(typeof timestamp).toBe('string');
    expect(new Date(timestamp).getFullYear()).toBeGreaterThan(2020);
  });
});
