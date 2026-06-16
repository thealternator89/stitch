// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCopilotModels } from '../useCopilotModels';

const mockModels = [
  { id: 'auto', name: 'Auto' },
  { id: 'claude-3.5', name: 'Claude 3.5 Sonnet', billing: { multiplier: 1 } },
];

describe('useCopilotModels hook', () => {
  beforeEach(() => {
    // Directly attach to the existing jsdom global window to preserve standard DOM elements/properties
    (window as any).electronAPI = {
      getSettings: vi.fn(),
      listCopilotModels: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as any).electronAPI;
  });

  it('should load models and set the default selected model from settings', async () => {
    const getSettingsMock = vi.mocked(window.electronAPI.getSettings);
    const listCopilotModelsMock = vi.mocked(
      window.electronAPI.listCopilotModels,
    );

    getSettingsMock.mockResolvedValue({ copilotModel: 'claude-3.5' });
    listCopilotModelsMock.mockResolvedValue(mockModels);

    const { result } = renderHook(() => useCopilotModels());

    // Initially loading
    expect(result.current.loadingModels).toBe(true);

    await waitFor(() => {
      expect(result.current.loadingModels).toBe(false);
    });

    expect(result.current.models).toEqual(mockModels);
    expect(result.current.selectedModel).toBe('claude-3.5');
    expect(getSettingsMock).toHaveBeenCalledOnce();
    expect(listCopilotModelsMock).toHaveBeenCalledOnce();
  });

  it('should fallback to auto if setting is not set but model is present in list', async () => {
    const getSettingsMock = vi.mocked(window.electronAPI.getSettings);
    const listCopilotModelsMock = vi.mocked(
      window.electronAPI.listCopilotModels,
    );

    getSettingsMock.mockResolvedValue({});
    listCopilotModelsMock.mockResolvedValue(mockModels);

    const { result } = renderHook(() => useCopilotModels());

    await waitFor(() => {
      expect(result.current.loadingModels).toBe(false);
    });

    expect(result.current.selectedModel).toBe('auto');
  });

  it('should fallback to the first model in the list if setting is empty and auto is not present', async () => {
    const getSettingsMock = vi.mocked(window.electronAPI.getSettings);
    const listCopilotModelsMock = vi.mocked(
      window.electronAPI.listCopilotModels,
    );

    getSettingsMock.mockResolvedValue({});
    listCopilotModelsMock.mockResolvedValue([
      {
        id: 'claude-3.5',
        name: 'Claude 3.5 Sonnet',
        billing: { multiplier: 1 },
      },
      { id: 'o3-mini', name: 'o3-mini', billing: { multiplier: 1 } },
    ]);

    const { result } = renderHook(() => useCopilotModels());

    await waitFor(() => {
      expect(result.current.loadingModels).toBe(false);
    });

    expect(result.current.selectedModel).toBe('claude-3.5');
  });

  it('should handle API errors and not set selected model', async () => {
    const getSettingsMock = vi.mocked(window.electronAPI.getSettings);
    const listCopilotModelsMock = vi.mocked(
      window.electronAPI.listCopilotModels,
    );

    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    getSettingsMock.mockRejectedValue(new Error('IPC Error'));
    listCopilotModelsMock.mockResolvedValue([]);

    const { result } = renderHook(() => useCopilotModels());

    await waitFor(() => {
      expect(result.current.loadingModels).toBe(false);
    });

    expect(result.current.models).toEqual([]);
    expect(result.current.selectedModel).toBe('');
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
