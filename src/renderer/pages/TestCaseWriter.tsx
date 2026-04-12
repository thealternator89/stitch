import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useCopilotModels } from '../hooks/useCopilotModels';
import ModelDropdown from '../components/ModelDropdown';

const generateTicketOrCommentText = (testCases: string) =>
  [
    'Test Cases:',
    '',
    testCases,
    '',
    'Generated with Stitch and GitHub Copilot.',
    'Like any AI generated content, mistakes and hallucinations can occur. Please review before relying on it.',
  ].join('\n');

const TestCaseWriter: React.FC = () => {
  const navigate = useNavigate();
  const [ticketId, setTicketId] = useState('');
  const [context, setContext] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStarted, setGenerationStarted] = useState(false);
  const [ticketData, setTicketData] = useState<any>(null);
  const [testCases, setTestCases] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isPosting, setIsPosting] = useState(false);
  const { models, selectedModel, setSelectedModel, loadingModels } =
    useCopilotModels();

  const handleAddComment = async () => {
    setIsPosting(true);
    try {
      const text = generateTicketOrCommentText(testCases);
      await (window as any).electronAPI.addComment(ticketId, text);
      alert('Comment added successfully!');
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Failed to add comment.');
    } finally {
      setIsPosting(false);
    }
  };

  const handleAddTask = async () => {
    setIsPosting(true);
    try {
      const text = generateTicketOrCommentText(testCases);
      await (window as any).electronAPI.addChildTask(ticketId, 'BA Test', text);
      alert('Task created successfully!');
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Failed to create task.');
    } finally {
      setIsPosting(false);
    }
  };

  const handleGenerate = async () => {
    if (!ticketId) {
      setError('Please enter a ticket ID.');
      return;
    }

    setError('');
    setIsGenerating(true);
    setGenerationStarted(true);
    setTestCases('');
    setTicketData(null);

    try {
      // 1. Fetch Ticket Data
      const fetchedTicket = await (window as any).electronAPI.fetchTicket(
        ticketId,
      );
      setTicketData(fetchedTicket);

      // 2. Generate Test Cases using Copilot SDK
      const generatedResult = await (
        window as any
      ).electronAPI.generateTestCases(fetchedTicket, context, selectedModel);
      setTestCases(generatedResult);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred during generation.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="container mt-4">
      <div className="mb-4">
        <button
          className="btn btn-outline-secondary btn-sm"
          onClick={() => navigate('/')}
        >
          <i className="fas fa-arrow-left me-2"></i>
          Back to Menu
        </button>
      </div>

      <div className="row">
        {/* Left Column: Input Form */}
        <div className="col-md-4">
          <div className="card shadow-sm mb-4">
            <div className="card-header bg-primary text-white">
              <h5 className="mb-0">Ticket Details</h5>
            </div>
            <div className="card-body">
              {error && <div className="alert alert-danger">{error}</div>}

              <div className="mb-3">
                <label className="form-label">Ticket ID (Azure DevOps)</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g., 12345"
                  value={ticketId}
                  onChange={(e) => setTicketId(e.target.value)}
                  disabled={isGenerating}
                />
              </div>

              <div className="mb-3">
                <label className="form-label">
                  Additional Context (Optional)
                </label>
                <textarea
                  className="form-control"
                  rows={4}
                  placeholder="e.g., focus on edge cases or accessibility requirements..."
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  disabled={isGenerating}
                />
              </div>

              <button
                className="btn btn-primary w-100"
                onClick={handleGenerate}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <>
                    <span
                      className="spinner-border spinner-border-sm me-2"
                      role="status"
                      aria-hidden="true"
                    ></span>
                    Generating...
                  </>
                ) : (
                  <>
                    <i className="fas fa-magic me-2"></i>
                    Generate Test Cases
                  </>
                )}
              </button>
            </div>
          </div>

          {ticketData && (
            <div className="card shadow-sm border-info">
              <div className="card-header bg-info text-white">
                <h6 className="mb-0">Fetched Ticket: #{ticketData.id}</h6>
              </div>
              <div className="card-body">
                <h6>{ticketData.title}</h6>
                <div
                  className="text-muted small overflow-auto"
                  style={{ maxHeight: '200px' }}
                  dangerouslySetInnerHTML={{ __html: ticketData.description }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Results */}
        <div className="col-md-8">
          <div className="card shadow-sm h-100 min-vh-50">
            <div className="card-header bg-dark text-white d-flex justify-content-between align-items-center">
              <h5 className="mb-0">Generated Test Cases</h5>
              <div className="d-flex align-items-center gap-2">
                {!generationStarted && (
                  <ModelDropdown
                    models={models}
                    selectedModel={selectedModel}
                    onSelect={setSelectedModel}
                    loading={loadingModels}
                    className="w-25"
                  />
                )}
                {testCases && (
                  <button
                    className="btn btn-sm btn-outline-light"
                    onClick={() => navigator.clipboard.writeText(testCases)}
                  >
                    <i className="fas fa-copy me-1"></i>
                    Copy
                  </button>
                )}
              </div>
            </div>
            <div
              className="card-body overflow-auto"
              style={{ maxHeight: '600px' }}
            >
              {testCases ? (
                <div className="markdown-content">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {testCases}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="text-center py-5 text-muted">
                  {isGenerating ? (
                    <div className="py-5">
                      <div
                        className="spinner-grow text-primary"
                        role="status"
                      ></div>
                      <p className="mt-3">Asking Copilot to write tests...</p>
                    </div>
                  ) : (
                    <p>
                      Enter a ticket ID and click "Generate" to see the results
                      here.
                    </p>
                  )}
                </div>
              )}
            </div>
            {testCases && (
              <div className="card-footer d-flex justify-content-end gap-2">
                <button
                  className="btn btn-outline-primary"
                  onClick={handleAddComment}
                  disabled={isPosting}
                >
                  <i className="fas fa-comment me-2"></i>
                  Add Comment
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleAddTask}
                  disabled={isPosting}
                >
                  <i className="fas fa-tasks me-2"></i>
                  Add Task
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TestCaseWriter;
