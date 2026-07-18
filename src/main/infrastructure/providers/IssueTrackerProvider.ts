import { TicketData } from '../../../types';

export interface IssueTrackerProvider {
  fetchTicket(ticketId: string): Promise<TicketData>;
  addComment(
    ticketId: string,
    text: string,
    options?: { edited?: boolean },
  ): Promise<void>;
  createTicket(
    type: string,
    parentTicketId: string,
    data: TicketData,
    options?: { edited?: boolean },
  ): Promise<void>;
  searchTickets(query: string, type?: string): Promise<TicketData[]>;
  getWorkItemTypes?(project: string): Promise<string[]>;
}
