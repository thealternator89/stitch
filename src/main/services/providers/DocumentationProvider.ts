import { DocPageData } from '../../../types';

export interface DocumentationProvider {
  fetchPage(pageId: string): Promise<DocPageData>;
  searchPages(query: string): Promise<DocPageData[]>;
}
