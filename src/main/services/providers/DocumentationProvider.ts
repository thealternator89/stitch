import { DocPageData } from '../../../types';

export interface DocumentationProvider {
  fetchPage(pageId: string): Promise<DocPageData>;
}
