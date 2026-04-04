import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Story {
  title: string;
  description: string;
  acceptanceCriteria: string;
  notes?: string;
  checked?: boolean;
}

const StoryWriter: React.FC = () => {
  const navigate = useNavigate();
  const [pageId, setPageId] = useState('');
  const [context, setContext] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [pageData, setPageData] = useState<any>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [error, setError] = useState<string>('');
  const [featureId, setFeatureId] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleGenerate = async () => {
    if (!pageId) {
      setError('Please enter a Confluence Page ID.');
      return;
    }

    setError('');
    setIsGenerating(true);
    setStories([]);
    setPageData(null);

    try {
      // 1. Fetch Page Data
      const fetchedPage = await (window as any).electronAPI.fetchConfluencePage(pageId);
      setPageData(fetchedPage);

      // 2. Generate Stories using Copilot SDK
      const generatedResult = await (window as any).electronAPI.generateStories(fetchedPage, context);
      const mappedStories = generatedResult.map((s: Story) => ({ ...s, checked: true }));
      setStories(mappedStories);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred during generation.');
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleStoryCheck = (index: number) => {
    const newStories = [...stories];
    newStories[index].checked = !newStories[index].checked;
    setStories(newStories);
  };

  const handleCreateStories = async () => {
    if (!featureId) {
      alert('Please enter a Feature ID.');
      return;
    }

    const storiesToCreate = stories.filter(s => s.checked);
    if (storiesToCreate.length === 0) {
      alert('Please check at least one story to create.');
      return;
    }

    setIsCreating(true);
    try {
      for (const story of storiesToCreate) {
        const descriptionWithDisclaimer = [
          story.description,
          '',
          'Generated with Stitch and GitHub Copilot.',
          'Like any AI generated content, mistakes and hallucinations can occur. Please review before relying on it.'
        ].join('\n');
        
        await (window as any).electronAPI.createPBI(featureId, story.title, descriptionWithDisclaimer, story.acceptanceCriteria);
      }
      alert(`Successfully created ${storiesToCreate.length} PBIs!`);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Failed to create stories.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="container mt-4">
      <div className="mb-4">
        <button className="btn btn-outline-secondary btn-sm" onClick={() => navigate('/')}>
          <i className="fas fa-arrow-left me-2"></i>
          Back to Menu
        </button>
      </div>

      <div className="row">
        {/* Left Column: Input Form */}
        <div className="col-md-4">
          <div className="card shadow-sm mb-4">
            <div className="card-header bg-success text-white">
              <h5 className="mb-0">Confluence Page Details</h5>
            </div>
            <div className="card-body">
              {error && <div className="alert alert-danger">{error}</div>}
              
              <div className="mb-3">
                <label className="form-label">Page ID</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="e.g., 123456789"
                  value={pageId}
                  onChange={(e) => setPageId(e.target.value)}
                  disabled={isGenerating}
                />
                <div className="form-text">You can find the numerical Page ID in the Confluence URL.</div>
              </div>

              <div className="mb-3">
                <label className="form-label">Additional Context (Optional)</label>
                <textarea 
                  className="form-control" 
                  rows={4}
                  placeholder="e.g., focus on backend APIs or split them by component..."
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  disabled={isGenerating}
                />
              </div>

              <button 
                className="btn btn-success w-100" 
                onClick={handleGenerate}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                    Generating...
                  </>
                ) : (
                  <>
                    <i className="fas fa-magic me-2"></i>
                    Generate Stories
                  </>
                )}
              </button>
            </div>
          </div>

          {pageData && (
            <div className="card shadow-sm border-info">
              <div className="card-header bg-info text-white">
                <h6 className="mb-0">Fetched Page: {pageData.title}</h6>
              </div>
              <div className="card-body">
                <div 
                  className="text-muted small overflow-auto" 
                  style={{ maxHeight: '200px' }}
                  dangerouslySetInnerHTML={{ __html: pageData.body }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Results */}
        <div className="col-md-8">
          <div className="card shadow-sm h-100 min-vh-50">
            <div className="card-header bg-dark text-white d-flex justify-content-between align-items-center">
              <h5 className="mb-0">Generated Stories</h5>
              {stories.length > 0 && (
                <button 
                  className="btn btn-sm btn-outline-light" 
                  onClick={() => navigator.clipboard.writeText(JSON.stringify(stories, null, 2))}
                >
                  <i className="fas fa-copy me-1"></i>
                  Copy JSON
                </button>
              )}
            </div>
            <div className="card-body overflow-auto bg-light" style={{ maxHeight: '600px' }}>
              {stories.length > 0 ? (
                <div className="stories-list">
                  {stories.map((story, index) => (
                    <div key={index} className="card shadow-sm mb-3">
                      <div className="card-header bg-white d-flex justify-content-between align-items-center">
                        <h6 className="mb-0 text-primary">{story.title}</h6>
                        <div className="form-check m-0">
                          <input 
                            className="form-check-input" 
                            type="checkbox" 
                            checked={story.checked} 
                            onChange={() => toggleStoryCheck(index)} 
                            id={`check-${index}`}
                          />
                        </div>
                      </div>
                      <div className="card-body">
                        <div className="mb-3">
                          <strong>Description:</strong>
                          <p className="mb-0">{story.description}</p>
                        </div>
                        <div className="mb-3">
                          <strong>Acceptance Criteria:</strong>
                          <div className="markdown-content mt-2 bg-light p-2 rounded border">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{story.acceptanceCriteria}</ReactMarkdown>
                          </div>
                        </div>
                        {story.notes && (
                          <div>
                            <strong>Notes:</strong>
                            <p className="text-muted small mb-0">{story.notes}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-5 text-muted">
                  {isGenerating ? (
                    <div className="py-5">
                      <div className="spinner-grow text-success" role="status"></div>
                      <p className="mt-3">Asking Copilot to write stories...</p>
                    </div>
                  ) : (
                    <p>Enter a Confluence Page ID and click "Generate" to see the results here.</p>
                  )}
                </div>
              )}
            </div>
            {stories.length > 0 && (
              <div className="card-footer bg-light">
                <div className="d-flex justify-content-between align-items-center">
                  <div className="input-group" style={{ maxWidth: '300px' }}>
                    <span className="input-group-text border-primary bg-primary text-white">Feature ID</span>
                    <input 
                      type="text" 
                      className="form-control border-primary" 
                      placeholder="e.g. 12345"
                      value={featureId}
                      onChange={(e) => setFeatureId(e.target.value)}
                      disabled={isCreating}
                    />
                  </div>
                  <button 
                    className="btn btn-primary shadow-sm"
                    onClick={handleCreateStories}
                    disabled={isCreating}
                  >
                    {isCreating ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                        Creating PBIs...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-plus me-2"></i>
                        Create PBIs
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StoryWriter;
