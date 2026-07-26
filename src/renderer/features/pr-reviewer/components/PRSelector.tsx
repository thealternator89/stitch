import React from 'react';
import { PRMetadata } from '../../../../types';

interface PRSelectorProps {
  activeTab: 'assigned' | 'created' | 'all' | 'manual';
  setActiveTab: (tab: 'assigned' | 'created' | 'all' | 'manual') => void;
  isLoadingPRs: boolean;
  prSearchQuery: string;
  setPrSearchQuery: (query: string) => void;
  filteredPRs: PRMetadata[];
  selectedPR: PRMetadata | null;
  onSelectPR: (pr: PRMetadata) => void;
  manualPrUrlOrId: string;
  setManualPrUrlOrId: (value: string) => void;
  codeSource: string;
  onManualPRSubmit: (e: React.FormEvent) => void;
}

const PRSelector: React.FC<PRSelectorProps> = ({
  activeTab,
  setActiveTab,
  isLoadingPRs,
  prSearchQuery,
  setPrSearchQuery,
  filteredPRs,
  selectedPR,
  onSelectPR,
  manualPrUrlOrId,
  setManualPrUrlOrId,
  codeSource,
  onManualPRSubmit,
}) => {
  return (
    <div className={selectedPR ? 'col-md-5' : 'col-12'}>
      <div className="card shadow-sm border-0 bg-body-tertiary h-100">
        <div
          className="card-body p-4 d-flex flex-column"
          style={{ minHeight: '300px' }}
        >
          <h5 className="card-title fw-bold mb-3">
            <i className="fas fa-code-pull-request me-2 text-primary"></i>
            Select Pull Request
          </h5>

          {/* Navigation Tabs */}
          <ul className="nav nav-pills mb-3 gap-1">
            <li className="nav-item">
              <button
                className={`btn btn-sm ${activeTab === 'assigned' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setActiveTab('assigned')}
              >
                Assigned to Me
              </button>
            </li>
            <li className="nav-item">
              <button
                className={`btn btn-sm ${activeTab === 'created' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setActiveTab('created')}
              >
                Created by Me
              </button>
            </li>
            <li className="nav-item">
              <button
                className={`btn btn-sm ${activeTab === 'all' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setActiveTab('all')}
              >
                All Active PRs
              </button>
            </li>
            <li className="nav-item">
              <button
                className={`btn btn-sm ${activeTab === 'manual' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setActiveTab('manual')}
              >
                Manual ID/URL
              </button>
            </li>
          </ul>

          {activeTab === 'manual' ? (
            /* Manual Input Form */
            <form onSubmit={onManualPRSubmit} className="mt-2">
              <div className="mb-3">
                <label className="form-label text-muted small fw-semibold">
                  {codeSource === 'github' ? 'GitHub' : 'Azure DevOps'} PR URL
                  or ID
                </label>
                <input
                  type="text"
                  className="form-control"
                  placeholder={
                    codeSource === 'github'
                      ? 'https://github.com/.../pull/123 or just PR ID'
                      : 'https://dev.azure.com/.../pullrequest/123 or just PR ID'
                  }
                  value={manualPrUrlOrId}
                  onChange={(e) => setManualPrUrlOrId(e.target.value)}
                />
              </div>
              <button
                type="submit"
                className="btn btn-outline-primary w-100"
                disabled={isLoadingPRs || !manualPrUrlOrId.trim()}
              >
                Load PR Details
              </button>
            </form>
          ) : (
            /* Search Results / List */
            <div className="d-flex flex-column flex-grow-1">
              <div className="input-group input-group-sm mb-3">
                <span className="input-group-text bg-body-secondary border-end-0">
                  <i className="fas fa-search text-muted"></i>
                </span>
                <input
                  type="text"
                  className="form-control border-start-0"
                  placeholder="Search title, ID, or repo..."
                  value={prSearchQuery}
                  onChange={(e) => setPrSearchQuery(e.target.value)}
                />
              </div>

              <div
                className="overflow-y-auto flex-grow-1"
                style={{ maxHeight: '250px' }}
              >
                {isLoadingPRs ? (
                  <div className="text-center py-5 text-muted">
                    <span className="spinner-border spinner-border-sm mb-2"></span>
                    <p className="small mb-0">
                      Querying{' '}
                      {codeSource === 'github' ? 'GitHub' : 'Azure DevOps'}
                      ...
                    </p>
                  </div>
                ) : filteredPRs.length === 0 ? (
                  <div className="text-center py-5 text-muted small">
                    No active PRs found matching the criteria.
                  </div>
                ) : (
                  <div className="list-group list-group-flush border-top border-bottom">
                    {filteredPRs.map((pr) => (
                      <button
                        key={pr.id}
                        type="button"
                        className={`list-group-item list-group-item-action p-3 text-start ${
                          selectedPR?.id === pr.id
                            ? 'active bg-primary text-white'
                            : ''
                        }`}
                        onClick={() => onSelectPR(pr)}
                      >
                        <div className="d-flex w-100 justify-content-between mb-1">
                          <span className="fw-semibold small">PR #{pr.id}</span>
                          <span className="small opacity-75">
                            {pr.repositoryName}
                          </span>
                        </div>
                        <div
                          className="fw-bold mb-1 text-truncate"
                          title={pr.title}
                        >
                          {pr.title}
                        </div>
                        <div className="small opacity-75 d-flex justify-content-between">
                          <span>By: {pr.author}</span>
                          <span>
                            {pr.sourceBranch} &rarr; {pr.targetBranch}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PRSelector;
