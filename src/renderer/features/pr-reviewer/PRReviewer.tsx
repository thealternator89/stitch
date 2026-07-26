import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import PageLayout from '../../components/PageLayout';
import { useCopilotModels } from '../../hooks/useCopilotModels';
import {
  PRMetadata,
  CopilotUsage,
  Persona,
  ReviewComment,
} from '../../../types';
import UsageStatsToast from '../../components/UsageStatsToast';

import PRReviewHeader from './components/PRReviewHeader';
import PRSelector from './components/PRSelector';
import PRDetailsAndCheckout, {
  LocalReviewPhase,
} from './components/PRDetailsAndCheckout';
import PRReviewProgress, { PhaseProgress } from './components/PRReviewProgress';
import PRReviewSettings from './components/PRReviewSettings';
import PRReviewComments from './components/PRReviewComments';
import {
  EditCommentModal,
  DirtyRepoModal,
  GeneralErrorModal,
  NoPhasesModal,
} from './components/PRReviewerModals';

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

  const [phases, setPhases] = useState<LocalReviewPhase[]>([]);
  const [isLoadingPhases, setIsLoadingPhases] = useState(false);
  const [isCriticEnabled, setIsCriticEnabled] = useState<boolean>(() => {
    return localStorage.getItem('pr_reviewer_critic_enabled') !== 'false';
  });

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

  useEffect(() => {
    if (!isCriticEnabled) {
      window.electronAPI.setWindowProgress(-1);
      return;
    }

    if (isReviewing || isCritiquing) {
      const activeProgress = phaseProgress.filter(
        (p) => p.status !== 'skipped',
      );
      const total = activeProgress.length;
      const completed = activeProgress.filter(
        (p) => p.status === 'completed',
      ).length;
      const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

      if (percent === 0) {
        window.electronAPI.setWindowProgress(2, 'indeterminate');
      } else {
        window.electronAPI.setWindowProgress(percent / 100, 'normal');
      }
    } else {
      window.electronAPI.setWindowProgress(-1);
    }

    return () => {
      window.electronAPI.setWindowProgress(-1);
    };
  }, [isCriticEnabled, isReviewing, isCritiquing, phaseProgress]);

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

    const initialProgress: PhaseProgress[] = activePhases.map((p) => ({
      id: p.id,
      title: p.title,
      status: 'pending' as const,
      group: p.group,
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
            selectedPersona,
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

  const handleToggleCollapse = (index: number | string) => {
    setCollapsedComments((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const filteredPRs = prList.filter(
    (pr) =>
      pr.title.toLowerCase().includes(prSearchQuery.toLowerCase()) ||
      pr.id.toString().includes(prSearchQuery) ||
      pr.repositoryName.toLowerCase().includes(prSearchQuery.toLowerCase()),
  );

  const hasSelectedPhases = phases.some((p) => p.enabled);

  return (
    <PageLayout title="PR Reviewer">
      <div className="row g-4">
        {selectedPR && commitSha && isHeaderCollapsed ? (
          <PRReviewHeader
            selectedPR={selectedPR}
            setIsHeaderCollapsed={setIsHeaderCollapsed}
          />
        ) : (
          <>
            <PRSelector
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              isLoadingPRs={isLoadingPRs}
              prSearchQuery={prSearchQuery}
              setPrSearchQuery={setPrSearchQuery}
              filteredPRs={filteredPRs}
              selectedPR={selectedPR}
              onSelectPR={handleSelectPR}
              manualPrUrlOrId={manualPrUrlOrId}
              setManualPrUrlOrId={setManualPrUrlOrId}
              codeSource={codeSource}
              onManualPRSubmit={handleManualPRSubmit}
            />

            {selectedPR && (
              <PRDetailsAndCheckout
                selectedPR={selectedPR}
                repoPath={repoPath}
                repoPathModified={repoPathModified}
                isLoadingCheckout={isLoadingCheckout}
                loadingStatus={loadingStatus}
                onBrowseFolder={handleBrowseFolder}
                onCheckoutAndDiff={handleCheckoutAndDiff}
                phases={phases}
                isLoadingPhases={isLoadingPhases}
                models={models}
                loadingModels={loadingModels}
                toggleGroup={toggleGroup}
                togglePhase={togglePhase}
                isCriticEnabled={isCriticEnabled}
                setIsCriticEnabled={setIsCriticEnabled}
                commitSha={commitSha}
                setIsHeaderCollapsed={setIsHeaderCollapsed}
              />
            )}
          </>
        )}

        {selectedPR && commitSha && (
          <div className="col-12 mt-4">
            {isCriticEnabled && (isReviewing || isCritiquing) ? (
              <PRReviewProgress phaseProgress={phaseProgress} />
            ) : (
              <div className="row g-4">
                <PRReviewSettings
                  phaseProgress={phaseProgress}
                  isReviewing={isReviewing}
                  setPhaseProgress={setPhaseProgress}
                  getGeneralStatusText={getGeneralStatusText}
                  models={models}
                  selectedModel={selectedModel}
                  setSelectedModel={setSelectedModel}
                  loadingModels={loadingModels}
                  cpuCount={cpuCount}
                  maxParallelism={maxParallelism}
                  setMaxParallelism={setMaxParallelism}
                  personas={personas}
                  selectedPersona={selectedPersona}
                  handlePersonaChange={handlePersonaChange}
                  customInstructions={customInstructions}
                  setCustomInstructions={setCustomInstructions}
                  handleStartReview={handleStartReview}
                  commitSha={commitSha}
                  hasSelectedPhases={hasSelectedPhases}
                />

                <PRReviewComments
                  displayedComments={displayedComments}
                  comments={comments}
                  hasCritiqued={hasCritiqued}
                  commentViewMode={commentViewMode}
                  setCommentViewMode={setCommentViewMode}
                  activeCritiquedComments={activeCritiquedComments}
                  isReviewing={isReviewing}
                  hasReviewed={hasReviewed}
                  getGeneralStatusText={getGeneralStatusText}
                  lastStatusTime={lastStatusTime}
                  rejectedCritiquedComments={rejectedCritiquedComments}
                  collapsedComments={collapsedComments}
                  onToggleCollapse={handleToggleCollapse}
                  isPostingComment={isPostingComment}
                  onDismissComment={handleDismissComment}
                  onPostComment={handlePostComment}
                  onStartEditComment={(index, commentText) => {
                    setEditingCommentIndex(index);
                    setEditedCommentText(commentText);
                  }}
                  isHeaderCollapsed={isHeaderCollapsed}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {editingCommentIndex !== null && (
        <EditCommentModal
          editingCommentIndex={editingCommentIndex}
          editedCommentText={editedCommentText}
          setEditedCommentText={setEditedCommentText}
          onCancel={() => setEditingCommentIndex(null)}
          onPostComment={handlePostComment}
          comments={comments}
          isPostingComment={isPostingComment}
        />
      )}

      {showDirtyModal && (
        <DirtyRepoModal onDismiss={() => setShowDirtyModal(false)} />
      )}

      {showErrorModal && (
        <GeneralErrorModal
          errorTitle={errorTitle}
          errorMessage={errorMessage}
          onDismiss={() => setShowErrorModal(false)}
        />
      )}

      {showNoPhasesModal && (
        <NoPhasesModal
          onBack={() => navigate('/')}
          onViewDirectory={handleViewDirectory}
          onCheckAgain={loadPhases}
        />
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
