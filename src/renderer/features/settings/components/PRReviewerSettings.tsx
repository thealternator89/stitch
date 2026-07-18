import React from 'react';
import { Persona } from '../../../../types';

interface PRReviewerSettingsProps {
  personas: Persona[];
  setPersonas: (personas: Persona[]) => void;
  maxParallelism: number;
  setMaxParallelism: (limit: number) => void;
  cpuCount: number;
}

const PRReviewerSettings: React.FC<PRReviewerSettingsProps> = ({
  personas,
  setPersonas,
  maxParallelism,
  setMaxParallelism,
  cpuCount,
}) => {
  const handleAdd = () => {
    if (personas.length >= 5) return;
    setPersonas([...personas, { name: '', content: '' }]);
  };

  const handleUpdate = (index: number, field: keyof Persona, value: string) => {
    const updated = [...personas];
    // Remove newlines to enforce 1-line content constraint
    const sanitizedValue =
      field === 'content' ? value.replace(/[\r\n]/g, ' ') : value;
    updated[index] = {
      ...updated[index],
      [field]: sanitizedValue,
    };
    setPersonas(updated);
  };

  const handleDelete = (index: number) => {
    const updated = personas.filter((_, i) => i !== index);
    setPersonas(updated);
  };

  const isNameDuplicate = (name: string, index: number) => {
    const trimmed = name.trim().toLowerCase();
    if (!trimmed) return false;
    return personas.some(
      (p, i) => i !== index && p.name.trim().toLowerCase() === trimmed,
    );
  };

  return (
    <div className="card shadow-sm border-0 bg-body-tertiary">
      <div className="card-body p-4">
        <div className="d-flex justify-content-between align-items-center mb-4 border-bottom pb-2">
          <h5 className="mb-0">
            <i className="fas fa-user-tag me-2 text-primary"></i>PR Reviewer
            Personas
          </h5>
          <span className="badge bg-secondary-subtle text-secondary-emphasis border border-secondary-subtle">
            {personas.length} / 5 Personas
          </span>
        </div>

        <p className="text-muted small mb-4">
          You can use personas to customise how your agents talk and what they
          focus on.
        </p>

        {personas.length === 0 ? (
          <div className="text-center py-5 border rounded bg-body mb-4">
            <div className="text-muted mb-3" style={{ fontSize: '2.5rem' }}>
              <i className="fas fa-users-slash"></i>
            </div>
            <h6 className="fw-semibold text-muted">No Personas Configured</h6>
            <p className="text-muted small mb-3">
              Add a persona to start customizing review perspectives.
            </p>
            <button
              type="button"
              className="btn btn-primary btn-sm d-inline-flex align-items-center gap-2"
              onClick={handleAdd}
            >
              <i className="fas fa-plus"></i>
              Add Persona
            </button>
          </div>
        ) : (
          <div className="d-flex flex-column gap-3 mb-4">
            {personas.map((persona, index) => {
              const nameDup = isNameDuplicate(persona.name, index);
              const isNameNone = persona.name.trim().toLowerCase() === 'none';
              const showNameError =
                persona.name.trim() === '' || nameDup || isNameNone;
              const showContentError = persona.content.trim() === '';

              return (
                <div
                  key={index}
                  className="p-3 border rounded bg-body shadow-sm position-relative"
                >
                  <div className="d-flex justify-content-between align-items-center mb-3 gap-3">
                    <div className="flex-grow-1">
                      <input
                        type="text"
                        className={`form-control form-control-sm ${
                          showNameError ? 'is-invalid' : ''
                        }`}
                        placeholder="Persona Name"
                        value={persona.name}
                        maxLength={20}
                        onChange={(e) =>
                          handleUpdate(index, 'name', e.target.value)
                        }
                      />
                      {persona.name.trim() === '' && (
                        <div className="invalid-feedback">
                          Name is required.
                        </div>
                      )}
                      {nameDup && (
                        <div className="invalid-feedback">
                          Persona name must be unique.
                        </div>
                      )}
                      {isNameNone && (
                        <div className="invalid-feedback">
                          "None" is a reserved name.
                        </div>
                      )}
                    </div>
                    <div className="text-muted small font-monospace flex-shrink-0">
                      {persona.name.length}/20
                    </div>
                    <button
                      type="button"
                      className="btn btn-outline-danger btn-sm border-0 flex-shrink-0"
                      onClick={() => handleDelete(index)}
                      title="Delete Persona"
                    >
                      <i className="fas fa-trash-can"></i>
                    </button>
                  </div>

                  <div className="w-100">
                    <div className="d-flex justify-content-between mb-1">
                      <label className="form-label small fw-semibold mb-0">
                        Guidelines (Content)
                      </label>
                      <span className="text-muted small font-monospace">
                        {persona.content.length}/160
                      </span>
                    </div>
                    <input
                      type="text"
                      className={`form-control form-control-sm ${
                        showContentError ? 'is-invalid' : ''
                      }`}
                      placeholder="e.g. Focus on SQL injection, XSS, and authorization checks."
                      value={persona.content}
                      maxLength={160}
                      onChange={(e) =>
                        handleUpdate(index, 'content', e.target.value)
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                        }
                      }}
                    />
                    {persona.content.trim() === '' && (
                      <div className="invalid-feedback">
                        Guidelines are required.
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {personas.length > 0 && personas.length < 5 && (
          <button
            type="button"
            className="btn btn-outline-primary btn-sm d-flex align-items-center gap-2"
            onClick={handleAdd}
          >
            <i className="fas fa-plus"></i>
            Add Persona
          </button>
        )}

        {personas.length >= 5 && (
          <div className="text-muted small d-flex align-items-center gap-2">
            <i className="fas fa-info-circle text-info"></i>
            Maximum limit of 5 personas reached.
          </div>
        )}

        <hr className="my-4" />

        <h5 className="mb-4">
          <i className="fas fa-microchip me-2 text-primary"></i>PR Reviewer
          Concurrency Settings
        </h5>

        <div className="mb-2">
          <label className="form-label d-block fw-semibold text-muted small uppercase tracking-wider mb-2">
            Default Review Agent Parallelism
          </label>
          <p className="text-muted small mb-3">
            Configure how many parallel GitHub Copilot agents can run reviews
            concurrently.
          </p>
          {cpuCount < 4 ? (
            <div className="alert alert-info py-2 px-3 shadow-sm border-0 bg-info-subtle text-info-emphasis small d-flex align-items-center gap-2">
              <i className="fas fa-circle-info"></i>
              <span>
                Parallelism is locked to <strong>1</strong> because your system
                has <strong>{cpuCount} CPU cores</strong> (fewer than 4 required
                for parallel agents).
              </span>
            </div>
          ) : (
            <div>
              <div className="d-flex align-items-center gap-3">
                <input
                  type="range"
                  className="form-range flex-grow-0"
                  min="1"
                  max={cpuCount - 2}
                  value={maxParallelism}
                  onChange={(e) => setMaxParallelism(parseInt(e.target.value))}
                  style={{ maxWidth: '300px' }}
                />
                <span className="badge bg-primary fs-6 px-3 py-2">
                  {maxParallelism} Worker{maxParallelism > 1 ? 's' : ''}
                </span>
              </div>
              <p className="text-muted small mt-2 mb-0">
                Allowing between 1 and {cpuCount - 2} parallel agents (Total CPU
                cores: {cpuCount}).
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PRReviewerSettings;
