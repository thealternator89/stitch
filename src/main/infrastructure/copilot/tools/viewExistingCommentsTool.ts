/* eslint-disable @typescript-eslint/no-explicit-any */
import { CodeReviewProvider } from '../../providers/CodeReviewProvider';
import { ExistingPRCommentThread } from '../../../../types';

export function createViewExistingCommentsTool(
  provider: CodeReviewProvider,
  repoPath: string,
  prUrlOrId: string,
  remoteUrl?: string | null,
  getOnLine?: () => ((line: string) => void) | undefined,
) {
  let cachedThreads: ExistingPRCommentThread[] | null = null;

  return {
    name: 'get_existing_comments',
    description:
      'Fetch and search existing comment threads already posted on this Pull Request. File-based search can be either line-based (by specifying "file" and optional "startLine"/"endLine") or keyword-based (by specifying "file" and "keywords"). You can also search general PR comments by providing "keywords" without a "file". Use this tool to check if an issue has already been reported or resolved on the PR, and consider suggesting a reply to the existing thread instead of creating a duplicate comment.',
    parameters: {
      type: 'object',
      properties: {
        keywords: {
          type: 'string',
          description:
            'Keywords to search for in comment threads. When "file" is provided, searches comments on that file matching these keywords. When "file" is omitted, searches general PR comments.',
        },
        file: {
          type: 'string',
          description:
            'File path to filter comments (e.g. "src/auth/login.ts"). Can be combined with line ranges ("startLine", "endLine") for line-based search, or with "keywords" for file-specific keyword search.',
        },
        startLine: {
          type: 'number',
          description:
            'Optional start line number to filter line-based comments within this range.',
        },
        endLine: {
          type: 'number',
          description:
            'Optional end line number to filter line-based comments within this range.',
        },
      },
    },
    handler: async (args: {
      keywords?: string;
      file?: string;
      startLine?: number;
      endLine?: number;
    }) => {
      const onLine = getOnLine ? getOnLine() : undefined;

      if (!provider.getPRCommentThreads) {
        const errorMsg =
          'The current code review provider does not support fetching existing PR comments.';
        if (onLine) {
          onLine(JSON.stringify({ type: 'status', text: errorMsg }));
        }
        return `Error: ${errorMsg}`;
      }

      if (!cachedThreads) {
        if (onLine) {
          onLine(
            JSON.stringify({
              type: 'status',
              text: 'Critic fetching existing PR comments...',
            }),
          );
        }
        try {
          cachedThreads = await provider.getPRCommentThreads(
            repoPath,
            prUrlOrId,
            remoteUrl,
          );
        } catch (e: any) {
          const errorMsg = `Failed to fetch existing comments: ${e.message || e}`;
          if (onLine) {
            onLine(JSON.stringify({ type: 'status', text: errorMsg }));
          }
          return `Error: ${errorMsg}`;
        }
      }

      let results: ExistingPRCommentThread[] = [];
      const hasKeywords =
        typeof args.keywords === 'string' && args.keywords.trim().length > 0;
      const hasFile =
        typeof args.file === 'string' && args.file.trim().length > 0;
      const queryTerms = hasKeywords
        ? args.keywords!.toLowerCase().trim().split(/\s+/)
        : [];

      if (hasFile) {
        const targetFile = args
          .file!.replace(/\\/g, '/')
          .replace(/^\//, '')
          .toLowerCase();
        const start = args.startLine;
        const end = args.endLine ?? start;

        const fileMatches = cachedThreads.filter((t) => {
          if (t.type !== 'line' || !t.file) return false;
          const threadFile = t.file
            .replace(/\\/g, '/')
            .replace(/^\//, '')
            .toLowerCase();
          if (
            !threadFile.endsWith(targetFile) &&
            !targetFile.endsWith(threadFile)
          ) {
            return false;
          }

          // Line range filtering (if startLine or endLine specified)
          if (start !== undefined && t.lineRange) {
            const threadStart = t.lineRange.startLine ?? 0;
            const threadEnd = t.lineRange.endLine ?? threadStart;
            if (end !== undefined) {
              if (threadEnd < start || threadStart > end) {
                return false;
              }
            } else {
              if (start < threadStart || start > threadEnd) {
                return false;
              }
            }
          }

          // Keyword filtering specific to this file (if keywords specified)
          if (hasKeywords) {
            const commentsContent = t.comments
              .map((c) => c.content)
              .join(' ')
              .toLowerCase();
            if (!queryTerms.every((term) => commentsContent.includes(term))) {
              return false;
            }
          }

          return true;
        });

        results.push(...fileMatches);
      } else if (hasKeywords) {
        // General keyword-based search (when no file specified)
        const generalMatches = cachedThreads.filter((t) => {
          if (t.type !== 'general') return false;
          const commentsContent = t.comments
            .map((c) => c.content)
            .join(' ')
            .toLowerCase();
          return queryTerms.every((term) => commentsContent.includes(term));
        });
        results.push(...generalMatches);
      } else {
        // Neither file nor keywords specified: return all threads
        results = [...cachedThreads];
      }

      // Deduplicate results by thread ID
      const seen = new Set<number>();
      results = results.filter((t) => {
        if (seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      });

      if (results.length === 0) {
        return 'No existing comment threads found matching the specified criteria.';
      }

      const formatted = results
        .map((t) => {
          let locationStr = 'General PR Comment';
          if (t.type === 'line') {
            locationStr = `Line Comment on ${t.file || 'unknown'}`;
            if (t.lineRange?.startLine) {
              locationStr += `:${t.lineRange.startLine}`;
              if (
                t.lineRange.endLine &&
                t.lineRange.endLine !== t.lineRange.startLine
              ) {
                locationStr += `-${t.lineRange.endLine}`;
              }
            }
          }

          let header = `Thread #${t.id} [${locationStr}]`;
          header += `\nStatus: ${t.status || 'unknown'} (Resolved: ${t.isResolved ? 'YES' : 'NO'})`;

          const commentsText = t.comments
            .map((c, i) => {
              const author = c.author ? c.author : 'Unknown';
              const date = c.publishedDate
                ? ` at ${
                    typeof c.publishedDate === 'object'
                      ? c.publishedDate.toISOString()
                      : c.publishedDate
                  }`
                : '';
              return `  [Comment ${i + 1} by ${author}${date}]:\n  ${c.content.replace(/\n/g, '\n  ')}`;
            })
            .join('\n\n');

          return `--- ${header} ---\n${commentsText}\n--- End Thread #${t.id} ---`;
        })
        .join('\n\n');

      return `Found ${results.length} relevant comment thread(s) on the Pull Request:\n\n${formatted}`;
    },
  };
}
