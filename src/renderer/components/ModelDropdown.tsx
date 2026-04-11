import React from 'react';
import { CopilotModel } from '../hooks/useCopilotModels';

interface ModelDropdownProps {
  models: CopilotModel[];
  selectedModel: string;
  onSelect: (id: string) => void;
  loading: boolean;
  className?: string;
  disabled?: boolean;
  buttonVariant?: 'secondary' | 'outline-secondary';
}

const ModelDropdown: React.FC<ModelDropdownProps> = ({
  models,
  selectedModel,
  onSelect,
  loading,
  className,
  disabled,
  buttonVariant = 'secondary',
}) => (
  <div className={`dropdown${className ? ` ${className}` : ''}`}>
    <button
      type="button"
      className={`btn btn-${buttonVariant} dropdown-toggle text-start`}
      data-bs-toggle="dropdown"
      aria-expanded="false"
      disabled={loading || disabled}
    >
      {loading
        ? 'Loading models...'
        : models.find((m) => m.id === selectedModel)?.name ||
          (models.length === 0 ? 'No models available' : 'Select a model')}
    </button>
    <ul className="dropdown-menu">
      {models.map((model) => (
        <li key={model.id}>
          <button
            type="button"
            className={`dropdown-item d-flex justify-content-between align-items-center${selectedModel === model.id ? ' active' : ''}`}
            onClick={() => onSelect(model.id)}
          >
            <span className="me-2 text-truncate">{model.name}</span>
            <span className="text-muted ms-2">
              {`×${model.billing.multiplier}`}
            </span>
          </button>
        </li>
      ))}
    </ul>
  </div>
);

export default ModelDropdown;
