export function createReportIntentTool() {
  return {
    name: 'report_intent',
    description:
      'Report the current intent, status, or progress of the agent to the user.',
    parameters: {
      type: 'object',
      properties: {
        intent: {
          type: 'string',
          description: 'The status or intent message to report to the user.',
        },
      },
      required: ['intent'],
    },
    handler: async (args: { intent: string }) => {
      // The tool handler doesn't need to do any UI updating directly because
      // the agent's tool execution start event is already intercepted and
      // sent to the renderer. We just return a success response so the agent knows it worked.
      return `Status updated: "${args.intent}"`;
    },
  };
}
