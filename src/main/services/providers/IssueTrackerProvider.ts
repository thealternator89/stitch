import { TicketData } from '../../../types';

export interface IssueTrackerProvider {
  fetchTicket(ticketId: string): Promise<TicketData>;
  addComment(ticketId: string, text: string): Promise<void>;
  createTicket(
    type: string,
    parentTicketId: string,
    data: TicketData,
  ): Promise<void>;
}
