import { DocPageData } from '../../../types';

export interface DocumentationProvider {
  fetchPage(pageId: string): Promise<DocPageData>;
  searchPages(query: string): Promise<DocPageData[]>;
  isDocPageUrl(url: string): boolean;
  extractPageId(url: string): string | null;
}
