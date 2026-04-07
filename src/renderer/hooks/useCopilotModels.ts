import { useState, useEffect } from 'react';

export interface CopilotModel {
  id: string;
  name: string;
  billing?: { multiplier?: number };
}

export function useCopilotModels() {
  const [models, setModels] = useState<CopilotModel[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [loadingModels, setLoadingModels] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setLoadingModels(true);
        const settings = await (window as any).electronAPI.getSettings();
        const list: CopilotModel[] = await (window as any).electronAPI.listCopilotModels() || [];
        setModels(list);
        setSelectedModel(prev => {
          if (prev) return prev;
          if (settings?.copilotModel) return settings.copilotModel;
          const fallback = list.find(m => m.id === 'gpt-4.1');
          return fallback ? fallback.id : (list[0]?.id || '');
        });
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
