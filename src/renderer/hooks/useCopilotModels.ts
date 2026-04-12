import { useState, useEffect } from 'react';
import { CopilotModel } from '../../types';

export function useCopilotModels() {
  const [models, setModels] = useState<CopilotModel[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [loadingModels, setLoadingModels] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setLoadingModels(true);
        const settings = await window.electronAPI.getSettings();
        const list: CopilotModel[] =
          (await window.electronAPI.listCopilotModels()) ?? [];
        setModels(list);
        const defaultModel =
          settings?.copilotModel ??
          list.find((m) => m.id === 'gpt-4.1')?.id ??
          list[0]?.id;

        // Throw if no models can be loaded
        if (!defaultModel) throw new Error('No models available.');
        setSelectedModel(defaultModel);
      } catch (err) {
        console.error('Failed to load Copilot models:', err);
      } finally {
        setLoadingModels(false);
      }
    };

    load();
  }, []);

  return { models, selectedModel, setSelectedModel, loadingModels };
}
