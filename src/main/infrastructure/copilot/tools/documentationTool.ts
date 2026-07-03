/* eslint-disable @typescript-eslint/no-explicit-any */
import { DocumentationProvider } from '../../providers/DocumentationProvider';

export function createRequestDocumentationTool(
  getDocProvider: () => Promise<DocumentationProvider | null>,
  providedDocIds: Set<string>,
  getOnLine: () => ((line: string) => void) | undefined,
) {
  return {
    name: 'request_documentation',
    description:
      'Request the content of a document by its ID (e.g. from Confluence) to read its content.',
    parameters: {
      type: 'object',
      properties: {
        documentId: {
          type: 'string',
          description: 'The ID of the document to request.',
        },
      },
      required: ['documentId'],
    },
    handler: async (args: { documentId: string }) => {
      const docId = args.documentId;
      const onLine = getOnLine();
      const docProvider = await getDocProvider();
      if (!docProvider) {
        const errorMsg =
          'Documentation provider not configured. Cannot retrieve document.';
        if (onLine) {
          onLine(JSON.stringify({ type: 'status', text: errorMsg }));
        }
        return `Error: ${errorMsg}`;
      }

      if (providedDocIds.has(docId)) {
        const warningMsg = `Document with ID ${docId} has already been provided to you. Do not request it again. Use the information already in your context.`;
        if (onLine) {
          onLine(
            JSON.stringify({
              type: 'status',
              text: `Agent requested duplicate document ID: ${docId} (declined)`,
            }),
          );
        }
        return `Error: ${warningMsg}`;
      }

      try {
        const page = await docProvider.fetchPage(docId);
        providedDocIds.add(docId);

        if (onLine) {
          onLine(
            JSON.stringify({
              type: 'status',
              text: `Agent viewed document: ${page.title}`,
            }),
          );
        }

        return `Title: ${page.title}\nID: ${page.id}\nContent:\n${page.body}`;
      } catch (e: any) {
        const errorMsg = `Failed to fetch document: ${e.message || e}`;
        if (onLine) {
          onLine(JSON.stringify({ type: 'status', text: errorMsg }));
        }
        return `Error: ${errorMsg}`;
      }
    },
  };
}
