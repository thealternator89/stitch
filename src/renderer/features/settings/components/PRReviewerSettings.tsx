import React from 'react';
import { Persona } from '../../../../types';

interface PRReviewerSettingsProps {
  personas: Persona[];
  setPersonas: (personas: Persona[]) => void;
}

const PRReviewerSettings: React.FC<PRReviewerSettingsProps> = ({
  personas,
  setPersonas,
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
          Define custom personas that your code review agents can adopt (e.g.
          Security Auditor, Performance Guru, style-enforcer). Each persona has
          a unique name (up to 20 characters) and review guidelines (exactly 1
          line, up to 160 characters).
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
              const showNameError = persona.name.trim() === '' || nameDup;
              const showContentError = persona.content.trim() === '';

              return (
                <div
                  key={index}
                  className="p-3 border rounded bg-body shadow-sm position-relative"
                >
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <span className="fw-semibold text-muted small">
                      Persona #{index + 1}
                    </span>
                    <button
                      type="button"
                      className="btn btn-outline-danger btn-sm border-0"
                      onClick={() => handleDelete(index)}
                      title="Delete Persona"
                    >
                      <i className="fas fa-trash-can"></i>
                    </button>
                  </div>

                  <div className="row g-3">
                    <div className="col-md-4">
                      <div className="d-flex justify-content-between mb-1">
                        <label className="form-label small fw-semibold mb-0">
                          Name
                        </label>
                        <span className="text-muted small font-monospace">
                          {persona.name.length}/20
                        </span>
                      </div>
                      <input
                        type="text"
                        className={`form-control form-control-sm ${
                          showNameError ? 'is-invalid' : ''
                        }`}
                        placeholder="e.g. Security Specialist"
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
                    </div>

                    <div className="col-md-8">
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
                      />
                      {persona.content.trim() === '' && (
                        <div className="invalid-feedback">
                          Guidelines are required.
                        </div>
                      )}
                    </div>
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
      </div>
    </div>
  );
};

export default PRReviewerSettings;
