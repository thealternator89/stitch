import React, { useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useNavigate } from 'react-router-dom';
import PageLayout from '../../components/PageLayout';
import ModelDropdown from '../../components/ModelDropdown';
import { useCopilotModels } from '../../hooks/useCopilotModels';
import {
  PRMetadata,
  ReviewPhase,
  CopilotUsage,
  Persona,
  ReviewComment,
} from '../../../types';
import UsageStatsToast from '../../components/UsageStatsToast';

const PRReviewer: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<
    'assigned' | 'created' | 'all' | 'manual'
  >('assigned');
  const [prList, setPrList] = useState<PRMetadata[]>([]);
  const [isLoadingPRs, setIsLoadingPRs] = useState(false);
  const [prSearchQuery, setPrSearchQuery] = useState('');

  // Selected PR details
  const [selectedPR, setSelectedPR] = useState<PRMetadata | null>(null);
  const [repoPath, setRepoPath] = useState('');
  const [repoPathModified, setRepoPathModified] = useState(false);
  const [isLoadingCheckout, setIsLoadingCheckout] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');

  // Manual PR URL / ID input
  const [manualPrUrlOrId, setManualPrUrlOrId] = useState('');
  const [codeSource, setCodeSource] = useState('azureDevOps');

  // Checkout result
  const [commitSha, setCommitSha] = useState('');
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);

  // Review states
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [critiquedComments, setCritiquedComments] = useState<ReviewComment[]>(
    [],
  );
  const [hasCritiqued, setHasCritiqued] = useState(false);
  const [isCritiquing, setIsCritiquing] = useState(false);
  const [commentViewMode, setCommentViewMode] = useState<
    'critiqued' | 'unvalidated'
  >('critiqued');
  const [isReviewing, setIsReviewing] = useState(false);
  const [hasReviewed, setHasReviewed] = useState(false);
  const [lastStatusTime, setLastStatusTime] = useState<Date | null>(null);
  const [customInstructions, setCustomInstructions] = useState('');
  const [usageStats, setUsageStats] = useState<CopilotUsage | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selectedPersona, setSelectedPersona] = useState<string>('None');
  const { models, selectedModel, setSelectedModel, loadingModels } =
    useCopilotModels();
  const [collapsedComments, setCollapsedComments] = useState<
    Record<string | number, boolean>
  >({});
  const [isPostingComment, setIsPostingComment] = useState<
    Record<number, boolean>
  >({});

  // Modals
  const [showDirtyModal, setShowDirtyModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [showNoPhasesModal, setShowNoPhasesModal] = useState(false);
  const [editingCommentIndex, setEditingCommentIndex] = useState<number | null>(
    null,
  );
  const [editedCommentText, setEditedCommentText] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState('');
  const [errorTitle, setErrorTitle] = useState('Fetch & Checkout Failed');

  interface LocalReviewPhase extends ReviewPhase {
    enabled: boolean;
  }
  const [phases, setPhases] = useState<LocalReviewPhase[]>([]);
  const [isLoadingPhases, setIsLoadingPhases] = useState(false);
  const [isCriticEnabled, setIsCriticEnabled] = useState<boolean>(() => {
    return localStorage.getItem('pr_reviewer_critic_enabled') !== 'false';
  });

  const checkIsModelMissing = (phase: ReviewPhase) => {
    if (!phase.model) return false;
    return (
      !loadingModels &&
      !models.some((m) => m.id.toLowerCase() === phase.model!.toLowerCase())
    );
  };

  const groupedPhases = useMemo(() => {
    const groups: {
      name: string;
      phases: { phase: LocalReviewPhase; originalIndex: number }[];
    }[] = [];
    phases.forEach((phase, index) => {
      const groupName = phase.group || 'Ungrouped';
      let g = groups.find((group) => group.name === groupName);
      if (!g) {
        g = { name: groupName, phases: [] };
        groups.push(g);
      }
      g.phases.push({ phase, originalIndex: index });
    });
    return groups;
  }, [phases]);

  const toggleGroup = (groupName: string, checked: boolean) => {
    setPhases((prev) =>
      prev.map((p) => {
        if ((p.group || 'Ungrouped') === groupName) {
          const modelMissing =
            p.model &&
            !loadingModels &&
            !models.some((m) => m.id.toLowerCase() === p.model!.toLowerCase());
          return { ...p, enabled: modelMissing ? false : checked };
        }
        return p;
      }),
    );
  };

  const togglePhase = (originalIndex: number, checked: boolean) => {
    setPhases((prev) => {
      const copy = [...prev];
      const p = copy[originalIndex];
      const modelMissing =
        p.model &&
        !loadingModels &&
        !models.some((m) => m.id.toLowerCase() === p.model!.toLowerCase());
      copy[originalIndex] = {
        ...p,
        enabled: modelMissing ? false : checked,
      };
      return copy;
    });
  };

  interface PhaseProgress {
    id: string;
    title: string;
    status: 'pending' | 'in-progress' | 'completed' | 'skipped';
    reason?: string;
    statusText?: string;
  }
  const [phaseProgress, setPhaseProgress] = useState<PhaseProgress[]>([]);
  const [maxParallelism, setMaxParallelism] = useState<number>(2);
  const [cpuCount, setCpuCount] = useState<number>(4);

  const getGeneralStatusText = () => {
    const inProgressCount = phaseProgress.filter(
      (p) => p.status === 'in-progress',
    ).length;
    const completedCount = phaseProgress.filter(
      (p) => p.status === 'completed',
    ).length;
    const skippedCount = phaseProgress.filter(
      (p) => p.status === 'skipped',
    ).length;
    const pendingCount = phaseProgress.filter(
      (p) => p.status === 'pending',
    ).length;

    const parts: string[] = [];
    if (inProgressCount > 0) parts.push(`${inProgressCount} In Progress`);
    if (completedCount > 0) parts.push(`${completedCount} Complete`);
    if (skippedCount > 0) parts.push(`${skippedCount} Skipped`);
    if (pendingCount > 0 && parts.length === 0)
      parts.push(`${pendingCount} Pending`);

    let statusText = parts.length > 0 ? parts.join(', ') : 'Initializing';
    if (isReviewing) {
      statusText += '...';
    }
    return statusText;
  };

  const activeCritiquedComments = useMemo(
    () => critiquedComments.filter((c) => c.status !== 'rejected'),
    [critiquedComments],
  );

  const rejectedCritiquedComments = useMemo(
    () => critiquedComments.filter((c) => c.status === 'rejected'),
    [critiquedComments],
  );

  const displayedComments = useMemo(() => {
    if (hasCritiqued && commentViewMode === 'critiqued') {
      return activeCritiquedComments;
    }
    return comments;
  }, [hasCritiqued, commentViewMode, activeCritiquedComments, comments]);

  useEffect(() => {
    loadPhases();
    loadSettingsData();
  }, []);

  useEffect(() => {
    // If the selected persona is no longer in the list of personas, reset to None
    if (selectedPersona !== 'None' && personas.length > 0) {
      const exists = personas.some((p) => p.name === selectedPersona);
      if (!exists) {
        setSelectedPersona('None');
      }
    }
  }, [personas, selectedPersona]);

  useEffect(() => {
    if (loadingModels || models.length === 0 || phases.length === 0) return;
    const hasAnyMissing = phases.some((p) => {
      if (!p.model) return false;
      const hasModel = models.some(
        (m) => m.id.toLowerCase() === p.model!.toLowerCase(),
      );
      return !hasModel && p.enabled;
    });

    if (hasAnyMissing) {
      setPhases((prev) =>
        prev.map((p) => {
          if (p.model) {
            const hasModel = models.some(
              (m) => m.id.toLowerCase() === p.model!.toLowerCase(),
            );
            if (!hasModel && p.enabled) {
              return { ...p, enabled: false };
            }
          }
          return p;
        }),
      );
    }
  }, [models, loadingModels, phases]);

  const loadSettingsData = async () => {
    try {
      const cpus = await window.electronAPI.getCpuCount();
      setCpuCount(cpus);

      const settings = await window.electronAPI.getSettings();
      if (settings) {
        setCodeSource(settings.sources?.code || 'azureDevOps');
        setPersonas(settings.prReviewer?.personas || []);
        if (settings.maxParallelism !== undefined) {
          setMaxParallelism(settings.maxParallelism);
        } else {
          if (cpus < 4) {
            setMaxParallelism(1);
          } else {
            setMaxParallelism(Math.max(1, Math.floor(cpus / 2)));
          }
        }
      }
    } catch (err) {
      console.error('Failed to load settings data:', err);
    }
  };

  const loadPhases = async () => {
    setIsLoadingPhases(true);
    try {
      const results = await window.electronAPI.getPhases();
      setPhases(results.map((p) => ({ ...p, enabled: true })));
      setShowNoPhasesModal(results.length === 0);
    } catch (err) {
      console.error('Failed to load review phases:', err);
    } finally {
      setIsLoadingPhases(false);
    }
  };

  const handleViewDirectory = async () => {
    try {
      await window.electronAPI.openPRReviewerDirectory();
    } catch (err) {
      console.error('Failed to open PR reviewer directory:', err);
    }
  };

  // Fetch PRs when activeTab changes (unless tab is manual)
  useEffect(() => {
    if (activeTab === 'manual') return;
    loadProjectPRs();
  }, [activeTab]);

  const loadProjectPRs = async () => {
    setIsLoadingPRs(true);
    setPrList([]);
    try {
      if (activeTab !== 'manual') {
        const results = await window.electronAPI.searchPRs(activeTab);
        setPrList(results);
      }
    } catch (err: unknown) {
      console.error('Failed to load project pull requests:', err);
    } finally {
      setIsLoadingPRs(false);
    }
  };

  const handleSelectPR = async (pr: PRMetadata) => {
    let fullPR = pr;
    if (!pr.sourceBranch || !pr.targetBranch) {
      try {
        const details = await window.electronAPI.getPRDetails(
          '',
          pr.url || pr.id,
        );
        if (details) {
          fullPR = details;
        }
      } catch (err) {
        console.error('Failed to fetch full PR details:', err);
      }
    }
    setSelectedPR(fullPR);
    setRepoPath('');
    setRepoPathModified(false);
    setCommitSha('');
    setComments([]);
    setCollapsedComments({});
    setIsPostingComment({});
    setIsHeaderCollapsed(false);
    setHasReviewed(false);
    setSelectedPersona('None');

    // Fetch local path history for this repository name
    try {
      const historyPath = await window.electronAPI.getRepoPathHistory(
        pr.repositoryName,
      );
      if (historyPath) {
        setRepoPath(historyPath);
      }
    } catch (err) {
      console.error('Failed to get repo path history:', err);
    }

    // Load author persona association
    const authorKey = pr.authorUniqueName || pr.author;
    if (authorKey) {
      try {
        const savedPersona =
          await window.electronAPI.getAuthorPersona(authorKey);
        if (savedPersona) {
          setSelectedPersona(savedPersona);
        }
      } catch (err) {
        console.error('Failed to get author persona:', err);
      }
    }
  };

  const handlePersonaChange = async (value: string) => {
    setSelectedPersona(value);
    if (selectedPR) {
      const authorKey = selectedPR.authorUniqueName || selectedPR.author;
      if (authorKey) {
        try {
          await window.electronAPI.saveAuthorPersona(authorKey, value);
        } catch (err) {
          console.error('Failed to save author persona:', err);
        }
      }
    }
  };

  const handleManualPRSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualPrUrlOrId.trim()) return;

    setIsLoadingPRs(true);
    try {
      // Fetch details using dummy/empty path first or settings-based lookup
      const details = await window.electronAPI.getPRDetails(
        '',
        manualPrUrlOrId.trim(),
      );
      await handleSelectPR(details);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showError(msg);
    } finally {
      setIsLoadingPRs(false);
    }
  };

  const handleBrowseFolder = async () => {
    try {
      const path = await window.electronAPI.selectDirectory();
      if (path) {
        const verifyResult = await window.electronAPI.verifyRepoPath(path);
        setRepoPath(verifyResult.path);
        setRepoPathModified(verifyResult.wasModified);
      }
    } catch (err) {
      console.error('Failed to select directory:', err);
    }
  };

  const handleCheckoutAndDiff = async () => {
    if (!selectedPR) return;
    if (!repoPath) {
      showError('Please select a local repository path.');
      return;
    }

    setIsLoadingCheckout(true);
    setLoadingStatus('Running repository checks and checking out branch...');
    setCommitSha('');
    setComments([]);
    setCollapsedComments({});
    setIsPostingComment({});
    setHasReviewed(false);

    try {
      // 1. Checkout (runs dirty checking and remote URL matching internally on backend)
      const res = await window.electronAPI.checkoutPR(
        repoPath,
        parseInt(selectedPR.id),
        selectedPR.repositoryName,
      );
      setCommitSha(res.commitSha);

      // Save successful path to history mapping
      await window.electronAPI.saveRepoPathHistory(
        selectedPR.repositoryName,
        repoPath,
      );
      setIsHeaderCollapsed(true);
    } catch (err: unknown) {
      console.error('Checkout failed:', err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('uncommitted changes')) {
        setShowDirtyModal(true);
      } else {
        showError(msg);
      }
    } finally {
      setIsLoadingCheckout(false);
      setLoadingStatus('');
    }
  };

  const triggerNotification = (title: string, body: string) => {
    if (!document.hasFocus()) {
      window.electronAPI.showNotification(title, body).catch((err) => {
        console.error('Failed to show notification:', err);
      });
    }
  };

  const handleStartReview = async () => {
    if (!selectedPR || !commitSha) return;

    const activePhases = phases.filter((p) => p.enabled);
    const phaseWithTemplateError = activePhases.find((p) => p.templateError);
    if (phaseWithTemplateError) {
      showError(
        phaseWithTemplateError.templateError!,
        'Template Validation Error',
      );
      return;
    }

    setIsReviewing(true);
    setHasReviewed(false);
    setComments([]);
    setCritiquedComments([]);
    setHasCritiqued(false);
    setIsCritiquing(false);
    setCommentViewMode(isCriticEnabled ? 'critiqued' : 'unvalidated');
    setCollapsedComments({});
    setIsPostingComment({});
    setLastStatusTime(null);

    const initialProgress = activePhases.map((p) => ({
      id: p.id,
      title: p.title,
      status: 'pending' as const,
    }));
    if (isCriticEnabled) {
      initialProgress.push({
        id: 'critic-phase',
        title: 'Critic',
        status: 'pending' as const,
      });
    }
    setPhaseProgress(initialProgress);

    const localComments: ReviewComment[] = [];

    const unsubscribe = window.electronAPI.onPRReviewLine((line: string) => {
      try {
        const commentObj = JSON.parse(line);
        if (commentObj && commentObj.type === 'phase-start') {
          setPhaseProgress((prev) =>
            prev.map((p) =>
              p.id === commentObj.phaseId ? { ...p, status: 'in-progress' } : p,
            ),
          );
          setLastStatusTime(new Date());
        } else if (commentObj && commentObj.type === 'phase-skip') {
          setPhaseProgress((prev) =>
            prev.map((p) =>
              p.id === commentObj.phaseId
                ? { ...p, status: 'skipped', reason: commentObj.reason }
                : p,
            ),
          );
          setLastStatusTime(new Date());
        } else if (commentObj && commentObj.type === 'phase-end') {
          setPhaseProgress((prev) =>
            prev.map((p) =>
              p.id === commentObj.phaseId ? { ...p, status: 'completed' } : p,
            ),
          );
          setLastStatusTime(new Date());
        } else if (commentObj && commentObj.type === 'status') {
          if (commentObj.phaseId) {
            setPhaseProgress((prev) =>
              prev.map((p) =>
                p.id === commentObj.phaseId
                  ? { ...p, statusText: commentObj.status }
                  : p,
              ),
            );
          }
          setLastStatusTime(new Date());
        } else if (
          commentObj &&
          (commentObj.type === 'general' || commentObj.type === 'line')
        ) {
          localComments.push(commentObj);
          setComments((prev) => [...prev, commentObj]);
          setLastStatusTime(new Date());
        }
      } catch (err) {
        console.error('Failed to parse streaming review line:', err);
      }
    });

    try {
      setUsageStats(null);
      const enabledPhaseIds = activePhases.map((p) => p.id);
      const res = await window.electronAPI.reviewPR(
        repoPath,
        selectedPR.targetBranch,
        customInstructions,
        selectedModel,
        enabledPhaseIds,
        selectedPR.description,
        selectedPR.id,
        maxParallelism,
        selectedPersona,
        isCriticEnabled,
      );

      let currentUsage = res && res.usage ? res.usage : null;

      if (isCriticEnabled) {
        setPhaseProgress((prev) =>
          prev.map((p) =>
            p.id === 'critic-phase'
              ? {
                  ...p,
                  status: 'in-progress',
                  statusText: 'Critiquing generated comments...',
                }
              : p,
          ),
        );
        setIsCritiquing(true);
        try {
          const criticRes = await window.electronAPI.critiquePRComments(
            repoPath,
            localComments,
            selectedPR.description,
            selectedModel,
          );
          if (criticRes && criticRes.result) {
            setCritiquedComments(criticRes.result);
            setHasCritiqued(true);
            setCommentViewMode('critiqued');
            setPhaseProgress((prev) =>
              prev.map((p) =>
                p.id === 'critic-phase'
                  ? {
                      ...p,
                      status: 'completed',
                      statusText: 'Critic phase complete.',
                    }
                  : p,
              ),
            );
          } else {
            setPhaseProgress((prev) =>
              prev.map((p) =>
                p.id === 'critic-phase'
                  ? {
                      ...p,
                      status: 'completed',
                      statusText: 'Critic phase complete.',
                    }
                  : p,
              ),
            );
          }
          if (criticRes && criticRes.usage) {
            if (currentUsage) {
              const mergedPhases = [
                ...(currentUsage.phases || []),
                ...(criticRes.usage.phases || []),
              ];
              currentUsage = {
                inputTokens:
                  currentUsage.inputTokens + criticRes.usage.inputTokens,
                outputTokens:
                  currentUsage.outputTokens + criticRes.usage.outputTokens,
                cacheReadTokens:
                  currentUsage.cacheReadTokens +
                  criticRes.usage.cacheReadTokens,
                cost: currentUsage.cost + criticRes.usage.cost,
                phases: mergedPhases,
              };
            } else {
              currentUsage = criticRes.usage;
            }
          }
        } catch (criticErr) {
          console.error('Critic execution failed:', criticErr);
          const criticMsg =
            criticErr instanceof Error ? criticErr.message : String(criticErr);
          showError(criticMsg, 'Critic Phase Failed');
          setPhaseProgress((prev) =>
            prev.map((p) =>
              p.id === 'critic-phase'
                ? {
                    ...p,
                    status: 'skipped',
                    reason: `Critic failed: ${criticMsg}`,
                  }
                : p,
            ),
          );
        } finally {
          setIsCritiquing(false);
        }
      }

      if (currentUsage) {
        setUsageStats(currentUsage);
      }
      setHasReviewed(true);
      triggerNotification(
        'PR Review Complete',
        `The review for PR #${selectedPR.id} ("${selectedPR.title}") has completed successfully.`,
      );
    } catch (err: unknown) {
      console.error('Review execution failed:', err);
      const msg = err instanceof Error ? err.message : String(err);
      showError(msg);
      triggerNotification(
        'PR Review Failed',
        `The review for PR #${selectedPR.id} ("${selectedPR.title}") failed to complete.`,
      );
      if (isCriticEnabled) {
        setPhaseProgress((prev) =>
          prev.map((p) =>
            p.id === 'critic-phase'
              ? { ...p, status: 'skipped', reason: 'Review phase failed' }
              : p,
          ),
        );
      }
    } finally {
      setIsReviewing(false);
      unsubscribe();
    }
  };

  const handleRunCritic = async () => {
    if (!selectedPR || comments.length === 0 || isCritiquing) return;
    setIsCritiquing(true);
    try {
      const res = await window.electronAPI.critiquePRComments(
        repoPath,
        comments,
        selectedPR.description,
        selectedModel,
      );
      if (res && res.result) {
        setCritiquedComments(res.result);
        setHasCritiqued(true);
        setCommentViewMode('critiqued');
      }
      if (res && res.usage) {
        setUsageStats((prev) => {
          if (!prev) return res.usage;
          const mergedPhases = [
            ...(prev.phases || []),
            ...(res.usage.phases || []),
          ];
          return {
            inputTokens: prev.inputTokens + res.usage.inputTokens,
            outputTokens: prev.outputTokens + res.usage.outputTokens,
            cacheReadTokens: prev.cacheReadTokens + res.usage.cacheReadTokens,
            cost: prev.cost + res.usage.cost,
            phases: mergedPhases,
          };
        });
      }
      triggerNotification(
        'Critic Phase Complete',
        `The Critic phase for PR #${selectedPR.id} evaluated ${comments.length} comments.`,
      );
    } catch (err: unknown) {
      console.error('Critic execution failed:', err);
      const msg = err instanceof Error ? err.message : String(err);
      showError(msg, 'Critic Phase Failed');
      triggerNotification(
        'Critic Phase Failed',
        `The Critic phase for PR #${selectedPR.id} failed to complete.`,
      );
    } finally {
      setIsCritiquing(false);
    }
  };

  const showError = (msg: string, title = 'Fetch & Checkout Failed') => {
    setErrorMessage(msg);
    setErrorTitle(title);
    setShowErrorModal(true);
  };

  const handleDismissComment = (index: number) => {
    setCollapsedComments((prev) => ({ ...prev, [index]: true }));
  };

  const handlePostComment = async (
    comment: ReviewComment,
    index: number,
    updatedText?: string,
  ) => {
    if (!selectedPR) return;

    setIsPostingComment((prev) => ({ ...prev, [index]: true }));
    try {
      const prIdentifier =
        activeTab === 'manual' ? manualPrUrlOrId : selectedPR.id;

      const commentText =
        updatedText !== undefined ? updatedText : comment.comment;

      const isEdited =
        updatedText !== undefined && updatedText !== comment.comment;

      await window.electronAPI.postPRComment(repoPath, prIdentifier, {
        type: comment.type,
        file: comment.file,
        line: comment.line,
        comment: commentText,
        edited: isEdited,
      });

      // Mark as posted in both lists
      const updateList = (prev: ReviewComment[]) =>
        prev.map((c, i) =>
          i === index ||
          (c.comment === comment.comment &&
            c.file === comment.file &&
            c.line === comment.line)
            ? { ...c, comment: commentText, posted: true }
            : c,
        );
      setComments(updateList);
      setCritiquedComments(updateList);

      setCollapsedComments((prev) => ({ ...prev, [index]: true }));
      setEditingCommentIndex(null);
    } catch (err: unknown) {
      console.error('Failed to post comment:', err);
      const msg = err instanceof Error ? err.message : String(err);
      showError(msg);
    } finally {
      setIsPostingComment((prev) => ({ ...prev, [index]: false }));
    }
  };

  const handleToggleCollapse = (index: number) => {
    setCollapsedComments((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const filteredPRs = prList.filter(
    (pr) =>
      pr.title.toLowerCase().includes(prSearchQuery.toLowerCase()) ||
      pr.id.toString().includes(prSearchQuery) ||
      pr.repositoryName.toLowerCase().includes(prSearchQuery.toLowerCase()),
  );

  const renderCriticCardUI = () => {
    const total = phaseProgress.length;
    const completed = phaseProgress.filter(
      (p) => p.status === 'completed' || p.status === 'skipped',
    ).length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    return (
      <div className="card shadow-sm border-0 mb-4 bg-body">
        <div className="card-body p-4">
          <div className="d-flex align-items-center justify-content-between mb-4 pb-3 border-bottom flex-wrap gap-2">
            <div>
              <h4 className="fw-bold mb-1 d-flex align-items-center gap-2">
                <i className="fas fa-microchip text-primary"></i>
                PR Review Progress
              </h4>
              <p className="text-muted small mb-0">
                Running automated review phases and Critic refinement.
              </p>
            </div>
            <div className="text-end">
              <span className="badge bg-primary-subtle text-primary border border-primary-subtle px-3 py-2 fs-6 rounded-pill">
                {percent}% Complete
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="progress mb-4" style={{ height: '10px' }}>
            <div
              className="progress-bar progress-bar-striped progress-bar-animated bg-primary"
              role="progressbar"
              style={{ width: `${percent}%` }}
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>

          {/* Cards Grid */}
          <div className="row row-cols-1 row-cols-md-2 row-cols-lg-3 g-3">
            {phaseProgress.map((p) => {
              let cardBg = 'bg-body';
              let borderClass = 'border';
              let icon = <i className="far fa-circle text-muted fs-5"></i>;
              let statusTextClass = 'text-muted';
              let badgeColor = 'bg-secondary-subtle text-secondary-emphasis';
              let displayStatus = 'Pending';
              let statusMsg = p.statusText || '';

              if (p.status === 'in-progress') {
                cardBg = 'bg-primary-subtle bg-opacity-10';
                borderClass = 'border-primary shadow-sm';
                icon = (
                  <i className="fas fa-circle-notch fa-spin text-primary fs-5"></i>
                );
                statusTextClass = 'text-primary-emphasis fw-semibold';
                badgeColor =
                  'bg-primary-subtle text-primary-emphasis border border-primary-subtle';
                displayStatus = 'Active';
                if (!statusMsg) statusMsg = 'Analyzing diffs...';
              } else if (p.status === 'completed') {
                cardBg = 'bg-success-subtle bg-opacity-5';
                borderClass = 'border-success-subtle';
                icon = (
                  <i className="fas fa-check-circle text-success fs-5"></i>
                );
                statusTextClass = 'text-success-emphasis';
                badgeColor =
                  'bg-success-subtle text-success-emphasis border border-success-subtle';
                displayStatus = 'Complete';
                if (!statusMsg) statusMsg = 'Phase completed.';
              } else if (p.status === 'skipped') {
                cardBg = 'bg-warning-subtle bg-opacity-5';
                borderClass = 'border-warning-subtle';
                icon = <i className="fas fa-forward text-warning fs-5"></i>;
                statusTextClass = 'text-warning-emphasis';
                badgeColor =
                  'bg-warning-subtle text-warning-emphasis border border-warning-subtle';
                displayStatus = 'Skipped';
                statusMsg =
                  p.reason || 'Skipped (no matching files or conditions).';
              }

              return (
                <div key={p.id} className="col">
                  <div
                    className={`card h-100 ${cardBg} ${borderClass} rounded-3`}
                  >
                    <div className="card-body p-3 d-flex flex-column justify-content-between">
                      <div>
                        <div className="d-flex align-items-center justify-content-between mb-2">
                          <span className="small font-monospace text-muted">
                            Phase
                          </span>
                          <span
                            className={`badge ${badgeColor} font-monospace rounded-pill tiny-badge`}
                          >
                            {displayStatus}
                          </span>
                        </div>
                        <h6
                          className="card-title fw-bold text-truncate mb-2"
                          title={p.title}
                        >
                          {p.title}
                        </h6>
                      </div>

                      <div className="mt-2 border-top pt-2">
                        <div className="d-flex align-items-start gap-2">
                          <div className="mt-1 flex-shrink-0">{icon}</div>
                          <p
                            className={`small mb-0 flex-grow-1 ${statusTextClass}`}
                            style={{ minHeight: '40px', fontSize: '0.8rem' }}
                          >
                            {statusMsg}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const hasSelectedPhases = phases.some((p) => p.enabled);

  return (
    <PageLayout title="PR Reviewer">
      <div className="row g-4">
        {selectedPR && commitSha && isHeaderCollapsed ? (
          /* Collapsed Header Panel */
          <div className="col-12">
            <div className="card shadow-sm border-0 bg-body-tertiary">
              <div className="card-body p-3 d-flex flex-wrap align-items-center justify-content-between gap-3">
                <div className="d-flex align-items-center gap-3">
                  <div
                    className="d-flex align-items-center justify-content-center bg-primary text-white rounded-circle"
                    style={{ width: '40px', height: '40px', flexShrink: 0 }}
                  >
                    <i className="fas fa-code-pull-request"></i>
                  </div>
                  <div>
                    <div className="d-flex align-items-center flex-wrap gap-2">
                      <span className="fw-bold text-primary font-monospace small">
                        PR #{selectedPR.id}
                      </span>
                      <span className="badge bg-secondary-subtle text-secondary-emphasis font-monospace small">
                        {selectedPR.repositoryName}
                      </span>
                      <span className="text-muted small">
                        | By {selectedPR.author}
                      </span>
                    </div>
                    <h5 className="fw-bold mb-0 text-body mt-1">
                      {selectedPR.title}
                    </h5>
                  </div>
                </div>

                <div className="d-flex align-items-center flex-wrap gap-3">
                  <div className="text-muted small">
                    <strong>Branches:</strong>{' '}
                    <span className="font-monospace bg-body-secondary text-body px-2 py-1 rounded border">
                      {selectedPR.sourceBranch}
                    </span>{' '}
                    &rarr;{' '}
                    <span className="font-monospace bg-body-secondary text-body px-2 py-1 rounded border">
                      {selectedPR.targetBranch}
                    </span>
                  </div>
                  {selectedPR.url && (
                    <button
                      className="btn btn-sm btn-outline-secondary fw-semibold shadow-sm"
                      onClick={() =>
                        window.electronAPI.openExternal(selectedPR.url!)
                      }
                    >
                      <i className="fas fa-external-link-alt me-1"></i>
                      Open
                    </button>
                  )}
                  <button
                    className="btn btn-sm btn-outline-primary fw-semibold shadow-sm"
                    onClick={() => setIsHeaderCollapsed(false)}
                  >
                    <i className="fas fa-expand me-1"></i>
                    Expand Settings
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Expanded Configuration Panel */
          <>
            {/* Left Column: PR Lists / Selection */}
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
                    <form onSubmit={handleManualPRSubmit} className="mt-2">
                      <div className="mb-3">
                        <label className="form-label text-muted small fw-semibold">
                          {codeSource === 'github' ? 'GitHub' : 'Azure DevOps'}{' '}
                          PR URL or ID
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
                              {codeSource === 'github'
                                ? 'GitHub'
                                : 'Azure DevOps'}
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
                                onClick={() => handleSelectPR(pr)}
                              >
                                <div className="d-flex w-100 justify-content-between mb-1">
                                  <span className="fw-semibold small">
                                    PR #{pr.id}
                                  </span>
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

            {/* Right Column: Local Path Configuration (Only displays when a PR is selected) */}
            {selectedPR && (
              <div className="col-md-7">
                <div className="card shadow-sm border-0">
                  <div className="card-body p-4">
                    <h5 className="card-title fw-bold mb-3 text-primary">
                      PR Details & Checkout
                    </h5>

                    <div className="p-3 bg-body-tertiary rounded mb-4">
                      <div className="d-flex align-items-center justify-content-between mb-2">
                        <span className="badge bg-primary">
                          Repo: {selectedPR.repositoryName}
                        </span>
                        <span className="badge bg-secondary-subtle text-secondary-emphasis">
                          PR #{selectedPR.id}
                        </span>
                      </div>
                      <h4 className="fw-bold text-body mb-2">
                        {selectedPR.title}
                      </h4>
                      <div className="row g-2 text-muted small">
                        <div className="col-6">
                          <strong>Author:</strong> {selectedPR.author}
                        </div>
                        <div className="col-6">
                          <strong>Branches:</strong> {selectedPR.sourceBranch}{' '}
                          &rarr; {selectedPR.targetBranch}
                        </div>
                      </div>
                    </div>

                    {/* Local Repository Path Picker */}
                    <div className="mb-4">
                      <label className="form-label fw-semibold text-muted">
                        Locally Cloned Repo Path for "
                        {selectedPR.repositoryName}"
                      </label>
                      <div className="input-group">
                        <input
                          type="text"
                          className="form-control text-muted"
                          placeholder="Select the local clone directory..."
                          value={repoPath}
                          readOnly
                        />
                        <button
                          className="btn btn-outline-secondary"
                          type="button"
                          onClick={handleBrowseFolder}
                          disabled={isLoadingCheckout}
                        >
                          <i className="fas fa-folder-open me-1"></i>
                          Browse
                        </button>
                      </div>
                      {repoPathModified && (
                        <div className="text-warning small mt-1">
                          <i className="fas fa-exclamation-triangle me-1"></i>
                          Updated to repository root
                        </div>
                      )}
                      <div className="form-text small">
                        {repoPath
                          ? 'Local clone matches mapping history.'
                          : `Please select the directory where repository "${selectedPR.repositoryName}" is cloned.`}
                      </div>
                    </div>

                    {/* Review Phases Checklist */}
                    <div className="mb-4">
                      <label className="form-label fw-semibold text-muted d-block">
                        Active Review Phases
                      </label>
                      {isLoadingPhases ? (
                        <div className="text-muted small">
                          <span className="spinner-border spinner-border-sm me-2"></span>
                          Loading phases...
                        </div>
                      ) : phases.length === 0 ? (
                        <div className="text-muted small border rounded p-3 bg-body-tertiary">
                          No custom review phases found in{' '}
                          <code>~/.stitch/pr-reviewer/phases</code>. Standard
                          single-phase review will be used.
                        </div>
                      ) : (
                        <div
                          className="border rounded p-3 bg-body-tertiary"
                          style={{ maxHeight: '250px', overflowY: 'auto' }}
                        >
                          {groupedPhases.map((group) => {
                            const selectablePhases = group.phases.filter(
                              (p) => !checkIsModelMissing(p.phase),
                            );
                            const allChecked =
                              selectablePhases.length > 0 &&
                              selectablePhases.every((p) => p.phase.enabled);
                            const someChecked =
                              selectablePhases.some((p) => p.phase.enabled) &&
                              !allChecked;

                            return (
                              <div key={group.name} className="mb-3">
                                <div className="form-check mb-1">
                                  <input
                                    className="form-check-input"
                                    type="checkbox"
                                    id={`group-check-${group.name}`}
                                    checked={allChecked}
                                    disabled={selectablePhases.length === 0}
                                    ref={(el) => {
                                      if (el) {
                                        el.indeterminate = someChecked;
                                      }
                                    }}
                                    onChange={(e) =>
                                      toggleGroup(group.name, e.target.checked)
                                    }
                                  />
                                  <label
                                    className="form-check-label small fw-bold text-body"
                                    htmlFor={`group-check-${group.name}`}
                                  >
                                    {group.name}
                                  </label>
                                </div>
                                <div className="ms-4 border-start ps-3 py-1">
                                  {group.phases.map(
                                    ({ phase, originalIndex }) => {
                                      const modelMissing =
                                        checkIsModelMissing(phase);
                                      const phaseModel = phase.model;
                                      const matchedModel = phaseModel
                                        ? models.find(
                                            (m) =>
                                              m.id.toLowerCase() ===
                                              phaseModel.toLowerCase(),
                                          )
                                        : null;

                                      return (
                                        <div
                                          key={phase.id}
                                          className="form-check mb-1"
                                        >
                                          <input
                                            className="form-check-input"
                                            type="checkbox"
                                            id={`phase-check-${phase.id}`}
                                            checked={
                                              !modelMissing && phase.enabled
                                            }
                                            disabled={modelMissing}
                                            onChange={(e) =>
                                              togglePhase(
                                                originalIndex,
                                                e.target.checked,
                                              )
                                            }
                                          />
                                          <label
                                            className={`form-check-label small text-body-secondary ${
                                              modelMissing
                                                ? 'text-muted opacity-50'
                                                : ''
                                            }`}
                                            htmlFor={`phase-check-${phase.id}`}
                                          >
                                            {phase.title}
                                            {phase.templateError && (
                                              <span
                                                className="text-danger ms-2"
                                                title={phase.templateError}
                                                style={{ cursor: 'help' }}
                                              >
                                                <i className="fas fa-exclamation-circle"></i>
                                              </span>
                                            )}
                                            {phaseModel && matchedModel && (
                                              <span className="badge bg-secondary-subtle text-secondary-emphasis ms-2 font-monospace small">
                                                {matchedModel.name}
                                              </span>
                                            )}
                                            {phaseModel && modelMissing && (
                                              <span
                                                className="badge bg-danger-subtle text-danger border border-danger-subtle ms-2 font-monospace small"
                                                title="Model not available"
                                                style={{ cursor: 'help' }}
                                              >
                                                <i className="fas fa-times me-1"></i>
                                                {phaseModel}
                                              </span>
                                            )}
                                          </label>
                                        </div>
                                      );
                                    },
                                  )}
                                </div>
                              </div>
                            );
                          })}

                          {/* Fixed Critic Phase Toggle */}
                          <div
                            className={
                              phases.length > 0 ? 'border-top pt-3 mt-3' : ''
                            }
                          >
                            <div className="form-check d-flex align-items-start gap-2">
                              <input
                                className="form-check-input mt-1"
                                type="checkbox"
                                id="critic-phase-toggle"
                                checked={isCriticEnabled}
                                onChange={(e) => {
                                  setIsCriticEnabled(e.target.checked);
                                  localStorage.setItem(
                                    'pr_reviewer_critic_enabled',
                                    String(e.target.checked),
                                  );
                                }}
                              />
                              <div>
                                <label
                                  className="form-check-label small fw-bold text-body"
                                  htmlFor="critic-phase-toggle"
                                >
                                  Critic
                                </label>
                                <div
                                  className="text-muted small"
                                  style={{ fontSize: '0.75rem' }}
                                >
                                  Critiques and refines the generated comments
                                  once all review phases are complete.
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="text-end">
                      {commitSha && (
                        <button
                          className="btn btn-outline-secondary px-3 me-2 fw-semibold"
                          onClick={() => setIsHeaderCollapsed(true)}
                          type="button"
                        >
                          <i className="fas fa-compress me-1"></i>
                          Collapse Settings
                        </button>
                      )}
                      <button
                        className="btn btn-primary px-4 shadow-sm fw-semibold"
                        onClick={handleCheckoutAndDiff}
                        disabled={isLoadingCheckout || !repoPath}
                      >
                        {isLoadingCheckout ? (
                          <>
                            <span className="spinner-border spinner-border-sm me-2"></span>
                            Checking Out...
                          </>
                        ) : (
                          <>
                            <i className="fas fa-cloud-arrow-down me-2"></i>
                            Fetch & Checkout PR
                          </>
                        )}
                      </button>
                    </div>

                    {isLoadingCheckout && loadingStatus && (
                      <div className="mt-3 text-muted small d-flex align-items-center">
                        <i className="fas fa-circle-notch fa-spin me-2 text-primary"></i>
                        {loadingStatus}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Review Comments Segment (Displays once checked out and commitSha is generated) */}
        {selectedPR && commitSha && (
          <div className="col-12 mt-4">
            {isCriticEnabled && (isReviewing || isCritiquing) ? (
              renderCriticCardUI()
            ) : (
              <div className="row g-4">
                {/* Review Settings Side Column */}
                <div className="col-md-4">
                  <div className="card shadow-sm border-0 h-100">
                    <div
                      className="card-body p-4 d-flex flex-column"
                      style={{ minHeight: '300px' }}
                    >
                      <h5 className="card-title fw-bold mb-3">
                        <i className="fas fa-robot me-2 text-primary"></i>
                        {isReviewing || phaseProgress.length > 0
                          ? 'Review Progress'
                          : 'Review Settings'}
                      </h5>

                      {isReviewing || phaseProgress.length > 0 ? (
                        /* Phase Progress Checklist */
                        <div className="flex-grow-1 d-flex flex-column">
                          <div
                            className="list-group list-group-flush border rounded overflow-hidden flex-grow-1 overflow-y-auto mb-3"
                            style={{ maxHeight: '300px' }}
                          >
                            {phaseProgress.map((p) => (
                              <div
                                key={p.id}
                                className="list-group-item p-3"
                                style={{
                                  backgroundColor:
                                    p.status === 'in-progress'
                                      ? 'rgba(13, 110, 253, 0.1)'
                                      : 'transparent',
                                }}
                              >
                                <div className="d-flex align-items-center justify-content-between">
                                  <div
                                    className="d-flex align-items-center gap-2 text-truncate"
                                    style={{ maxWidth: '75%' }}
                                  >
                                    {p.status === 'pending' && (
                                      <i className="far fa-circle text-muted"></i>
                                    )}
                                    {p.status === 'in-progress' && (
                                      <i className="fas fa-circle-notch fa-spin text-primary"></i>
                                    )}
                                    {p.status === 'completed' && (
                                      <i className="fas fa-check-circle text-success"></i>
                                    )}
                                    {p.status === 'skipped' && (
                                      <i
                                        className="fas fa-forward text-warning"
                                        title={p.reason || 'Skipped'}
                                      ></i>
                                    )}
                                    <span
                                      className={`small text-truncate ${
                                        p.status === 'completed'
                                          ? 'text-decoration-line-through text-muted'
                                          : p.status === 'skipped'
                                            ? 'text-muted'
                                            : 'fw-semibold text-body'
                                      }`}
                                      title={p.title}
                                    >
                                      {p.title}
                                    </span>
                                  </div>
                                  {p.status === 'skipped' && (
                                    <span className="badge bg-warning-subtle text-warning-emphasis font-monospace tiny-badge">
                                      Skipped
                                    </span>
                                  )}
                                  {p.status === 'in-progress' && (
                                    <span className="badge bg-primary-subtle text-primary-emphasis font-monospace tiny-badge">
                                      Running
                                    </span>
                                  )}
                                  {p.status === 'completed' && (
                                    <span className="badge bg-success-subtle text-success-emphasis font-monospace tiny-badge">
                                      Done
                                    </span>
                                  )}
                                </div>
                                {p.status === 'in-progress' && p.statusText && (
                                  <div
                                    className="ps-4 mt-1 text-muted small text-truncate"
                                    title={p.statusText}
                                  >
                                    {p.statusText}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>

                          {isReviewing && (
                            <div className="mt-auto text-center text-muted small py-2 bg-body-secondary rounded">
                              <span className="spinner-border spinner-border-sm me-2 text-primary"></span>
                              {getGeneralStatusText()}
                            </div>
                          )}

                          {!isReviewing && (
                            <div className="d-flex flex-column gap-2 mt-auto">
                              {comments.length > 0 && (
                                <button
                                  className="btn btn-outline-info btn-sm w-100 fw-semibold"
                                  onClick={handleRunCritic}
                                  disabled={isCritiquing}
                                >
                                  {isCritiquing ? (
                                    <>
                                      <span className="spinner-border spinner-border-sm me-2"></span>
                                      Checking Comments...
                                    </>
                                  ) : (
                                    <>
                                      <i className="fas fa-user-check me-2"></i>
                                      {hasCritiqued
                                        ? 'Re-run Critic Phase'
                                        : 'Check Comments'}
                                    </>
                                  )}
                                </button>
                              )}
                              <button
                                className="btn btn-outline-primary btn-sm w-100 fw-semibold"
                                onClick={() => {
                                  setPhaseProgress([]);
                                }}
                              >
                                <i className="fas fa-arrow-left me-2"></i>
                                Back to Settings
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        /* Original Review Settings Inputs */
                        <>
                          {/* Model Selection */}
                          <div className="mb-3">
                            <label className="form-label text-muted small fw-semibold">
                              Copilot Model
                            </label>
                            <ModelDropdown
                              models={models}
                              selectedModel={selectedModel}
                              onSelect={setSelectedModel}
                              loading={loadingModels}
                            />
                          </div>

                          {/* Max Parallelism */}
                          <div className="mb-3">
                            <label className="form-label text-muted small fw-semibold d-block mb-1">
                              Review Agent Parallelism
                            </label>
                            {cpuCount < 4 ? (
                              <div className="text-muted small">
                                Parallelism fixed at 1 (fewer than 4 CPU cores).
                              </div>
                            ) : (
                              <div>
                                <div className="d-flex align-items-center gap-2">
                                  <input
                                    type="range"
                                    className="form-range"
                                    min="1"
                                    max={cpuCount - 2}
                                    value={maxParallelism}
                                    onChange={(e) =>
                                      setMaxParallelism(
                                        parseInt(e.target.value),
                                      )
                                    }
                                    disabled={isReviewing}
                                    style={{ flexGrow: 1 }}
                                  />
                                  <span className="badge bg-secondary font-monospace">
                                    {maxParallelism}x
                                  </span>
                                </div>
                                <span
                                  className="text-muted tiny"
                                  style={{ fontSize: '0.75rem' }}
                                >
                                  Range: 1 to {cpuCount - 2} workers (CPUs:{' '}
                                  {cpuCount})
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Persona Selector */}
                          <div className="mb-3">
                            <label className="form-label text-muted small fw-semibold">
                              Review Persona (Optional)
                            </label>
                            <select
                              className="form-select form-select-sm"
                              value={selectedPersona}
                              onChange={(e) =>
                                handlePersonaChange(e.target.value)
                              }
                              disabled={isReviewing}
                            >
                              <option value="None">None (Default)</option>
                              {personas.map((p) => (
                                <option key={p.name} value={p.name}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Custom Review Instructions */}
                          <div className="mb-4 flex-grow-1 d-flex flex-column">
                            <label className="form-label text-muted small fw-semibold">
                              Specific Instructions (Optional)
                            </label>
                            <textarea
                              className="form-control flex-grow-1"
                              rows={3}
                              style={{ minHeight: '80px', resize: 'none' }}
                              placeholder="E.g., Focus on security, look out for proper error handling, verify database queries, etc."
                              value={customInstructions}
                              onChange={(e) =>
                                setCustomInstructions(e.target.value)
                              }
                              disabled={isReviewing}
                            />
                          </div>

                          {/* Action Button */}
                          <button
                            className="btn btn-primary w-100 py-2 fw-semibold shadow-sm mb-2"
                            onClick={handleStartReview}
                            disabled={
                              isReviewing || !commitSha || !hasSelectedPhases
                            }
                          >
                            <i className="fas fa-play me-2"></i>
                            Start Code Review
                          </button>
                          {!hasSelectedPhases && (
                            <div className="text-warning small text-center mt-1">
                              <i className="fas fa-exclamation-triangle me-1"></i>
                              Select at least one phase in PR settings to start
                              review.
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Review Comments Screen */}
                <div className="col-md-8">
                  <div className="card shadow-sm border-0 h-100">
                    <div
                      className="card-body p-4 d-flex flex-column"
                      style={{
                        height: isHeaderCollapsed
                          ? 'calc(100vh - 365px)'
                          : '450px',
                        minHeight: '300px',
                      }}
                    >
                      <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
                        <h5 className="card-title fw-bold mb-0">
                          <i className="fas fa-comments me-2 text-primary"></i>
                          Review Comments ({displayedComments.length})
                        </h5>
                        {hasCritiqued && (
                          <div className="btn-group btn-group-sm" role="group">
                            <button
                              type="button"
                              className={`btn ${commentViewMode === 'critiqued' ? 'btn-primary' : 'btn-outline-secondary'}`}
                              onClick={() => setCommentViewMode('critiqued')}
                            >
                              <i className="fas fa-user-check me-1"></i>
                              Critiqued ({activeCritiquedComments.length})
                            </button>
                            <button
                              type="button"
                              className={`btn ${commentViewMode === 'unvalidated' ? 'btn-primary' : 'btn-outline-secondary'}`}
                              onClick={() => setCommentViewMode('unvalidated')}
                            >
                              <i className="fas fa-list me-1"></i>
                              Unvalidated ({comments.length})
                            </button>
                          </div>
                        )}
                      </div>

                      {isReviewing && comments.length > 0 && (
                        <div className="alert alert-info py-2 px-3 mb-3 d-flex align-items-center justify-content-between shadow-sm border-0 bg-info-subtle text-info-emphasis small">
                          <div className="d-flex align-items-center gap-2">
                            <span
                              className="spinner-border spinner-border-sm text-info me-1"
                              style={{ width: '1rem', height: '1rem' }}
                            ></span>
                            <span>
                              <strong>Status:</strong> {getGeneralStatusText()}
                            </span>
                          </div>
                          {lastStatusTime && (
                            <span className="text-muted small font-monospace">
                              Last update: {lastStatusTime.toLocaleTimeString()}
                            </span>
                          )}
                        </div>
                      )}

                      {!isReviewing && hasReviewed && comments.length > 0 && (
                        <div className="alert alert-success py-2 px-3 mb-3 d-flex align-items-center justify-content-between shadow-sm border-0 bg-success-subtle text-success-emphasis small flex-wrap gap-2">
                          <div className="d-flex align-items-center gap-2">
                            <i className="fas fa-check-circle text-success me-1"></i>
                            <span>
                              <strong>Review complete</strong>
                              {hasCritiqued && ' • Critic phase completed'}
                            </span>
                          </div>
                          <div className="d-flex align-items-center gap-3">
                            <button
                              className="btn btn-sm btn-success py-1 px-3 fw-semibold shadow-sm"
                              onClick={handleRunCritic}
                              disabled={isCritiquing}
                            >
                              {isCritiquing ? (
                                <>
                                  <span className="spinner-border spinner-border-sm me-1"></span>
                                  Critiquing...
                                </>
                              ) : (
                                <>
                                  <i className="fas fa-user-check me-1"></i>
                                  {hasCritiqued
                                    ? 'Re-run Critic Phase'
                                    : 'Check Comments'}
                                </>
                              )}
                            </button>
                            {lastStatusTime && (
                              <span className="text-muted small font-monospace">
                                Completed at:{' '}
                                {lastStatusTime.toLocaleTimeString()}
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      <div
                        className="flex-grow-1 overflow-y-auto pe-1"
                        style={{ maxHeight: 'none' }}
                      >
                        {displayedComments.length === 0 &&
                        (!hasCritiqued ||
                          commentViewMode === 'unvalidated' ||
                          rejectedCritiquedComments.length === 0) ? (
                          <div className="h-100 d-flex flex-column align-items-center justify-content-center py-5 text-muted">
                            {isReviewing ? (
                              <>
                                <span
                                  className="spinner-border text-primary mb-3"
                                  style={{ width: '3rem', height: '3rem' }}
                                ></span>
                                <p className="fw-semibold text-body mb-1">
                                  {getGeneralStatusText()}
                                </p>
                                {lastStatusTime && (
                                  <p className="text-muted small mb-2">
                                    Last update:{' '}
                                    {lastStatusTime.toLocaleTimeString()}
                                  </p>
                                )}
                                <p className="small mb-0 text-center px-4">
                                  Copilot is analyzing the repository. Comments
                                  will appear here as they are generated.
                                </p>
                              </>
                            ) : hasReviewed ? (
                              <>
                                <i className="fas fa-check-circle fa-3x mb-3 text-success"></i>
                                <p className="fw-bold text-success fs-5 mb-1">
                                  Review complete
                                </p>
                                <p className="small mb-0 text-center px-4 text-muted">
                                  No comments were suggested.
                                </p>
                              </>
                            ) : (
                              <>
                                <i className="fas fa-clipboard-list fa-3x mb-3 text-secondary opacity-50"></i>
                                <p className="fw-semibold text-body mb-1">
                                  No comments generated yet
                                </p>
                                <p className="small mb-0 text-center px-4">
                                  Configure instructions on the left and click
                                  "Start Code Review" to begin.
                                </p>
                              </>
                            )}
                          </div>
                        ) : (
                          <div className="comments-list">
                            {displayedComments.map((comment, index) => {
                              const isLine = comment.type === 'line';
                              if (collapsedComments[index]) {
                                return (
                                  <div
                                    key={index}
                                    className="card shadow-sm border-0 mb-2 bg-body-secondary opacity-75"
                                  >
                                    <div className="card-body p-2 d-flex align-items-center justify-content-between">
                                      <div className="d-flex align-items-center gap-2">
                                        {comment.phase && (
                                          <span className="badge bg-info-subtle text-info-emphasis">
                                            {comment.phase}
                                          </span>
                                        )}
                                        {comment.status === 'approved' && (
                                          <span className="badge bg-success-subtle text-success-emphasis">
                                            <i className="fas fa-check me-1"></i>
                                            Approved
                                          </span>
                                        )}
                                        {comment.status === 'edited' && (
                                          <span className="badge bg-warning-subtle text-warning-emphasis">
                                            <i className="fas fa-edit me-1"></i>
                                            Edited by Critic
                                          </span>
                                        )}
                                        {comment.status === 'merged' && (
                                          <span className="badge bg-primary-subtle text-primary-emphasis">
                                            <i className="fas fa-code-merge me-1"></i>
                                            Merged by Critic
                                          </span>
                                        )}
                                        {comment.posted ? (
                                          <span className="text-success small fw-semibold">
                                            <i className="fas fa-check-circle me-1"></i>
                                            Posted to PR
                                          </span>
                                        ) : (
                                          <span className="text-muted small fw-semibold">
                                            <i className="fas fa-times-circle me-1"></i>
                                            Dismissed
                                          </span>
                                        )}
                                        {isLine && comment.file && (
                                          <span
                                            className="font-monospace text-muted small text-truncate"
                                            style={{ maxWidth: '300px' }}
                                            title={`${comment.file}:${comment.line}`}
                                          >
                                            {comment.file}:{comment.line}
                                          </span>
                                        )}
                                      </div>
                                      <button
                                        className="btn btn-sm btn-link text-decoration-none p-0 px-2"
                                        onClick={() =>
                                          handleToggleCollapse(index)
                                        }
                                      >
                                        <i className="fas fa-chevron-down me-1"></i>{' '}
                                        Expand
                                      </button>
                                    </div>
                                  </div>
                                );
                              }

                              return (
                                <div
                                  key={index}
                                  className={`card shadow-sm border-0 mb-3 ${
                                    isLine
                                      ? 'border-start border-4 border-primary'
                                      : 'bg-body-tertiary'
                                  }`}
                                >
                                  <div className="card-body p-3">
                                    <div className="d-flex align-items-center justify-content-between mb-2 pb-2 border-bottom border-secondary-subtle">
                                      <div className="d-flex align-items-center gap-2 flex-wrap">
                                        {comment.phase && (
                                          <span className="badge bg-info-subtle text-info-emphasis">
                                            {comment.phase}
                                          </span>
                                        )}
                                        {comment.status === 'approved' && (
                                          <span className="badge bg-success-subtle text-success-emphasis">
                                            <i className="fas fa-check me-1"></i>
                                            Approved
                                          </span>
                                        )}
                                        {comment.status === 'edited' && (
                                          <span className="badge bg-warning-subtle text-warning-emphasis">
                                            <i className="fas fa-edit me-1"></i>
                                            Edited by Critic
                                          </span>
                                        )}
                                        {comment.status === 'merged' && (
                                          <span className="badge bg-primary-subtle text-primary-emphasis">
                                            <i className="fas fa-code-merge me-1"></i>
                                            Merged by Critic
                                          </span>
                                        )}
                                      </div>
                                      {isLine && comment.file && (
                                        <span
                                          className="font-monospace text-muted small text-truncate ms-2"
                                          style={{ maxWidth: '70%' }}
                                          title={`${comment.file}:${comment.line}`}
                                        >
                                          {comment.file}:{comment.line}
                                        </span>
                                      )}
                                    </div>

                                    {isLine &&
                                      comment.codeLines &&
                                      comment.codeLines.length > 0 && (
                                        <div
                                          className="mb-3 rounded overflow-hidden border border-secondary-subtle"
                                          style={{ backgroundColor: '#1e1e1e' }}
                                        >
                                          <pre
                                            className="m-0 p-2 text-white font-monospace small"
                                            style={{
                                              overflowX: 'auto',
                                              whiteSpace: 'pre',
                                            }}
                                          >
                                            {comment.codeLines.map(
                                              (
                                                lineObj: {
                                                  line: number;
                                                  text: string;
                                                  isTarget: boolean;
                                                },
                                                idx: number,
                                              ) => (
                                                <div
                                                  key={idx}
                                                  style={{
                                                    backgroundColor:
                                                      lineObj.isTarget
                                                        ? 'rgba(255, 235, 59, 0.15)'
                                                        : 'transparent',
                                                    borderLeft: lineObj.isTarget
                                                      ? '3px solid #ffeb3b'
                                                      : '3px solid transparent',
                                                    paddingLeft:
                                                      lineObj.isTarget
                                                        ? '5px'
                                                        : '8px',
                                                    display: 'flex',
                                                  }}
                                                >
                                                  <span
                                                    className="me-3 select-none"
                                                    style={{
                                                      width: '35px',
                                                      display: 'inline-block',
                                                      textAlign: 'right',
                                                      flexShrink: 0,
                                                      color: '#858585',
                                                    }}
                                                  >
                                                    {lineObj.line}
                                                  </span>
                                                  <span className="text-break-none">
                                                    {lineObj.text}
                                                  </span>
                                                </div>
                                              ),
                                            )}
                                          </pre>
                                        </div>
                                      )}

                                    <div className="markdown-content text-body small">
                                      <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                      >
                                        {comment.comment}
                                      </ReactMarkdown>
                                    </div>

                                    {/* Card Actions */}
                                    <div className="d-flex justify-content-end gap-2 mt-3 pt-2 border-top border-secondary-subtle">
                                      <button
                                        className="btn btn-sm btn-outline-secondary"
                                        onClick={() =>
                                          handleDismissComment(index)
                                        }
                                      >
                                        <i className="fas fa-eye-slash me-1"></i>
                                        Dismiss
                                      </button>
                                      <div className="btn-group" role="group">
                                        <button
                                          className="btn btn-sm btn-primary"
                                          onClick={() =>
                                            handlePostComment(comment, index)
                                          }
                                          disabled={isPostingComment[index]}
                                        >
                                          {isPostingComment[index] ? (
                                            <>
                                              <span className="spinner-border spinner-border-sm me-1"></span>
                                              Posting...
                                            </>
                                          ) : (
                                            <>
                                              <i className="fas fa-paper-plane me-1"></i>
                                              Post
                                            </>
                                          )}
                                        </button>
                                        <button
                                          className="btn btn-sm btn-primary"
                                          onClick={() => {
                                            setEditingCommentIndex(index);
                                            setEditedCommentText(
                                              comment.comment,
                                            );
                                          }}
                                          disabled={isPostingComment[index]}
                                          title="Edit comment before posting"
                                        >
                                          <i className="fas fa-edit"></i>
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}

                            {hasCritiqued &&
                              commentViewMode === 'critiqued' &&
                              rejectedCritiquedComments.length > 0 && (
                                <div className="mt-4 pt-3 border-top border-secondary-subtle">
                                  <h6 className="fw-bold text-muted mb-3 d-flex align-items-center">
                                    <i className="fas fa-ban text-danger me-2"></i>
                                    Rejected Comments (
                                    {rejectedCritiquedComments.length})
                                  </h6>
                                  {rejectedCritiquedComments.map(
                                    (comment, rIdx) => {
                                      const keyIndex = `rejected-${rIdx}`;
                                      const isCollapsed =
                                        collapsedComments[keyIndex] !== false;
                                      const isLine = comment.type === 'line';
                                      return (
                                        <div
                                          key={keyIndex}
                                          className="card shadow-sm border-0 mb-2 bg-body-tertiary opacity-75"
                                        >
                                          <div className="card-body p-3">
                                            <div className="d-flex align-items-center justify-content-between">
                                              <div className="d-flex align-items-center gap-2 flex-wrap">
                                                <span className="badge bg-danger-subtle text-danger-emphasis fw-semibold">
                                                  <i className="fas fa-times-circle me-1"></i>
                                                  {comment.reason || 'Rejected'}
                                                </span>
                                                {comment.phase && (
                                                  <span className="badge bg-secondary-subtle text-secondary-emphasis">
                                                    {comment.phase}
                                                  </span>
                                                )}
                                                {isLine && comment.file && (
                                                  <span
                                                    className="font-monospace text-muted small text-truncate"
                                                    style={{
                                                      maxWidth: '250px',
                                                    }}
                                                    title={`${comment.file}:${comment.line}`}
                                                  >
                                                    {comment.file}:
                                                    {comment.line}
                                                  </span>
                                                )}
                                              </div>
                                              <button
                                                className="btn btn-sm btn-link text-decoration-none p-0 px-2 ms-2"
                                                onClick={() =>
                                                  setCollapsedComments(
                                                    (prev) => ({
                                                      ...prev,
                                                      [keyIndex]: !isCollapsed,
                                                    }),
                                                  )
                                                }
                                              >
                                                <i
                                                  className={`fas fa-chevron-${isCollapsed ? 'down' : 'up'} me-1`}
                                                ></i>
                                                {isCollapsed
                                                  ? 'Expand'
                                                  : 'Collapse'}
                                              </button>
                                            </div>
                                            {!isCollapsed && (
                                              <div className="mt-3 pt-2 border-top border-secondary-subtle">
                                                {isLine &&
                                                  comment.codeLines &&
                                                  comment.codeLines.length >
                                                    0 && (
                                                    <div
                                                      className="mb-2 rounded overflow-hidden border border-secondary-subtle"
                                                      style={{
                                                        backgroundColor:
                                                          '#1e1e1e',
                                                      }}
                                                    >
                                                      <pre
                                                        className="m-0 p-2 text-white font-monospace small"
                                                        style={{
                                                          overflowX: 'auto',
                                                          whiteSpace: 'pre',
                                                        }}
                                                      >
                                                        {comment.codeLines.map(
                                                          (lineObj, idx) => (
                                                            <div
                                                              key={idx}
                                                              style={{
                                                                backgroundColor:
                                                                  lineObj.isTarget
                                                                    ? 'rgba(255, 235, 59, 0.15)'
                                                                    : 'transparent',
                                                                borderLeft:
                                                                  lineObj.isTarget
                                                                    ? '3px solid #ffeb3b'
                                                                    : '3px solid transparent',
                                                                paddingLeft:
                                                                  lineObj.isTarget
                                                                    ? '5px'
                                                                    : '8px',
                                                                display: 'flex',
                                                              }}
                                                            >
                                                              <span
                                                                className="me-3 select-none"
                                                                style={{
                                                                  width: '35px',
                                                                  display:
                                                                    'inline-block',
                                                                  textAlign:
                                                                    'right',
                                                                  flexShrink: 0,
                                                                  color:
                                                                    '#858585',
                                                                }}
                                                              >
                                                                {lineObj.line}
                                                              </span>
                                                              <span className="text-break-none">
                                                                {lineObj.text}
                                                              </span>
                                                            </div>
                                                          ),
                                                        )}
                                                      </pre>
                                                    </div>
                                                  )}
                                                <div className="markdown-content text-body small">
                                                  <ReactMarkdown
                                                    remarkPlugins={[remarkGfm]}
                                                  >
                                                    {comment.comment}
                                                  </ReactMarkdown>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    },
                                  )}
                                </div>
                              )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit Comment Modal */}
      {editingCommentIndex !== null && (
        <div className="env-error-overlay">
          <div
            className="near-full-modal text-start"
            style={{
              textAlign: 'left',
              alignItems: 'stretch',
              padding: '30px',
            }}
          >
            <h4 className="fw-semibold mb-3">Edit Comment</h4>
            <div className="mb-4 flex-grow-1 d-flex flex-column">
              <label className="form-label text-muted small fw-semibold">
                Comment Content (Markdown Supported)
              </label>
              <textarea
                className="form-control flex-grow-1"
                rows={10}
                style={{
                  minHeight: '200px',
                  fontFamily: 'var(--bs-font-monospace)',
                }}
                placeholder="Write your comment here..."
                value={editedCommentText}
                onChange={(e) => setEditedCommentText(e.target.value)}
              />
            </div>
            <div className="d-flex justify-content-end gap-2 pt-2 border-top border-secondary-subtle">
              <button
                className="btn btn-sm btn-outline-secondary px-4"
                onClick={() => setEditingCommentIndex(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-sm btn-primary px-4"
                onClick={() =>
                  handlePostComment(
                    comments[editingCommentIndex],
                    editingCommentIndex,
                    editedCommentText,
                  )
                }
                disabled={isPostingComment[editingCommentIndex]}
              >
                {isPostingComment[editingCommentIndex] ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-1"></span>
                    Posting...
                  </>
                ) : (
                  <>
                    <i className="fas fa-paper-plane me-1"></i>
                    Post
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dirty Repository Modal */}
      {showDirtyModal && (
        <div className="env-error-overlay">
          <div className="env-error-modal">
            <div className="env-error-icon bg-warning text-white">
              <i className="fas fa-exclamation-triangle"></i>
            </div>
            <h4 className="env-error-title mt-3">Local Repository is Dirty</h4>
            <p className="env-error-message text-center text-muted px-3">
              The local git repository has uncommitted changes. To prevent loss
              of work or merge conflicts, you must commit, stash, or reset your
              local changes before continuing.
            </p>
            <div className="env-error-actions mt-4 w-100 d-flex justify-content-center">
              <button
                className="btn btn-indigo btn-lg px-5 shadow-sm"
                onClick={() => setShowDirtyModal(false)}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* General Error Modal */}
      {showErrorModal && (
        <div className="env-error-overlay">
          <div className="env-error-modal">
            <div className="env-error-icon bg-danger text-white">
              <i className="fas fa-xmark"></i>
            </div>
            <h4 className="env-error-title mt-3">{errorTitle}</h4>
            <div
              className="env-error-details w-100 text-start overflow-y-auto mb-3"
              style={{ maxHeight: '150px' }}
            >
              <pre
                className="mb-0 text-break font-monospace small"
                style={{ whiteSpace: 'pre-wrap' }}
              >
                {errorMessage}
              </pre>
            </div>
            <div className="env-error-actions w-100 d-flex justify-content-center">
              <button
                className="btn btn-indigo btn-lg px-5 shadow-sm"
                onClick={() => setShowErrorModal(false)}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* No Phases Modal */}
      {showNoPhasesModal && (
        <div className="env-error-overlay">
          <div className="near-full-modal">
            <button
              className="btn btn-link text-decoration-none text-secondary position-absolute d-flex align-items-center"
              style={{ top: '20px', left: '20px', fontSize: '14px' }}
              onClick={() => navigate('/')}
            >
              <i className="fas fa-arrow-left me-2"></i>
              Back
            </button>
            <div className="env-error-icon info">
              <i className="fas fa-sliders-h"></i>
            </div>
            <h3 className="env-error-title mt-3">Set Up Review Phases</h3>
            <p
              className="env-error-message text-center text-muted px-4 mb-4"
              style={{ maxWidth: '600px' }}
            >
              To use the PR Reviewer, you must configure at least one review
              phase. Review phases define the guidelines and checkpoints used
              during your reviews. We've automatically scaffolded the
              configuration folders on your system.
            </p>

            <div className="env-error-details w-100 mb-4 text-start font-monospace small">
              <div className="mb-2 fw-semibold text-body">Required Setup:</div>
              <div className="d-flex align-items-center gap-2 mb-3">
                <i className="far fa-folder text-warning"></i>
                <span className="text-secondary">
                  ~/.stitch/pr-reviewer/phases/
                </span>
                <span className="badge bg-danger-subtle text-danger-emphasis ms-auto">
                  Add .md files here
                </span>
              </div>

              <div className="mb-2 fw-semibold text-body">
                Optional Scaffolding:
              </div>
              <div className="d-flex align-items-center gap-2">
                <i className="far fa-folder text-muted"></i>
                <span className="text-secondary">
                  ~/.stitch/pr-reviewer/templates/
                </span>
              </div>
            </div>

            <div className="d-flex flex-column flex-sm-row gap-3 mt-2 w-100 justify-content-center">
              <button
                className="btn btn-outline-secondary px-4 py-2"
                onClick={() =>
                  window.electronAPI.openExternal(
                    'https://github.com/thealternator89/stitch/blob/main/docs/pr-reviewer/README.md',
                  )
                }
              >
                <i className="fas fa-book me-2"></i>
                Documentation
              </button>
              <button
                className="btn btn-outline-primary px-4 py-2"
                onClick={handleViewDirectory}
              >
                <i className="fas fa-folder-open me-2"></i>
                View Directory
              </button>
              <button
                className="btn btn-indigo px-4 py-2 shadow-sm"
                onClick={loadPhases}
              >
                <i className="fas fa-sync-alt me-2"></i>
                Check Again
              </button>
            </div>
          </div>
        </div>
      )}
      {usageStats && (
        <UsageStatsToast
          stats={usageStats}
          onClose={() => setUsageStats(null)}
        />
      )}
    </PageLayout>
  );
};

export default PRReviewer;
