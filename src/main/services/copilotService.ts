async function createCopilotClient() {
  // Eval to avoid webpack interfering with the import
  const { CopilotClient, approveAll } = await eval('import("@github/copilot-sdk")');

  // Windows has weird redirection issues, where the wrapper exits causing stdio to drop
  // To get around this, instead of launching `copilot` directly, we launch `node` with the 
  // `copilot` script as an argument. This seems to fix the issue.
  //
  // FIXME: Ideally once Copilot CLI or SDK come out of preview it will be working normally
  // and we can remove this
  if (process.platform === 'win32') {
    if (!process.env.NODE_PATH || !process.env.COPILOT_SCRIPT_PATH) {
      throw new Error('On Windows, both NODE_PATH and COPILOT_SCRIPT_PATH environment variables are required to initialise the Copilot client.');
    }
    return {
      client: new CopilotClient({
        cliPath: process.env.NODE_PATH,
        cliArgs: [process.env.COPILOT_SCRIPT_PATH],
        useStdio: true
      }),
      approveAll
    };
  }

  return { client: new CopilotClient(), approveAll };
}

export class CopilotService {
  private client: any = null;
  private approveAll: any = null;
  private session: any = null;
  private model: string = 'gpt-4.1';

  setModel(model: string) {
    if (model && model !== this.model) {
      this.model = model;
      // Invalidate the session so it will be re-created with the new model
      this.session = null;
    }
  }

  private async ensureCopilotClient() {
    if (!this.client) {
      const { client, approveAll } = await createCopilotClient();
      this.client = client;
      this.approveAll = approveAll;
    }
    await this.client.start();
    return this.client;
  }

  private async getSession() {
    await this.ensureCopilotClient();
    if (!this.session) {
      this.session = await this.client.createSession({
        model: this.model,
        availableTools: [], // Don't allow any tools to ensure the agent doesn't write to disk etc.
        onPermissionRequest: this.approveAll
      });
    }
    return this.session;
  }

  async checkAuthStatus() {
    try {
      await this.ensureCopilotClient();
      const authStatus = await this.client.getAuthStatus();
      const status = await this.client.getStatus();
      return { authStatus, status };
    } catch (error) {
      console.error('Error checking Copilot auth status:', error);
      throw error;
    }
  }

  async listModels() {
    try {
      await this.ensureCopilotClient();
      return await this.client.listModels();
    } catch (error) {
      console.error('Error listing Copilot models:', error);
      throw error;
    }
  }

  async generateTestCases(ticketData: any, additionalContext: string, modelOverride: string) {
    try {
      this.setModel(modelOverride);
      const session = await this.getSession();

      const prompt = `
        Generate a set of comprehensive test cases for the following user story/ticket.
        
        Ticket ID: ${ticketData.id}
        Title: ${ticketData.title}
        Description: ${ticketData.description}
        Acceptance Criteria: ${ticketData.acceptanceCriteria || 'N/A'}
        
        Additional Context: ${additionalContext || 'None provided'}
        
        Please format the output in a Markdown table, including:
        - Test Case ID
        - Description
        - Pre-conditions
        - Steps
        - Expected Result
        - Priority

        DO NOT create any files, directly output the test cases in your response here.
        DO NOT include any other text in your response other than the markdown table.
      `;

      const response = await session.sendAndWait({ prompt }, 180000);
      return response?.data?.content || 'No content returned from Copilot.';
    } catch (error) {
      console.error('Error generating test cases:', error);
      throw error;
    }
  }

  async generateStories(pageData: any, additionalContext: string, modelOverride: string) {
    try {
      this.setModel(modelOverride);
      const session = await this.getSession();

      const prompt = `
        Generate a set of user stories based on the following functional requirements from a Confluence page.
        
        Page Title: ${pageData.title}
        Page Content: ${pageData.body}
        
        Additional Context: ${additionalContext || 'None provided'}
        
        Please output ONLY a valid JSON array of objects, with no markdown formatting or other text.
        Each object should have the following properties:
        - "title": (string) The title of the story
        - "description": (string) Description. This should contain a statement in the format "As a... I want to... So that..." followed by 2 blank lines and then a longer description of the changes required for story.
        - "acceptanceCriteria": (string) Formatted as a list. Use markdown within the string with \\n for newlines.
        - "notes": (string) Any additional notes or assumptions (Optional, can be empty)

        DO NOT create any files, directly output the test cases in your response here.
        DO NOT include any other text (including markdown code block) in your response other than the JSON blob.
      `;

      const response = await session.sendAndWait({ prompt }, 180000);
      const rawContent = response?.data?.content || '[]';

      try {
        // Attempt to extract JSON from markdown code block if present
        const jsonMatch = rawContent.match(/```json\s*([\s\S]*?)\s*```/);
        const jsonString = jsonMatch ? jsonMatch[1] : rawContent.trim();
        return JSON.parse(jsonString);
      } catch (e) {
        console.error('Failed to parse JSON from Copilot response:', rawContent);
        throw new Error('Failed to parse stories from Copilot. The output was not valid JSON.');
      }
    } catch (error) {
      console.error('Error generating stories:', error);
      throw error;
    }
  }

  async cleanup() {
    if (this.session) {
      await this.session.destroy();
      this.session = null;
    }
    if (this.client) {
      await this.client.stop();
      this.client = null;
    }
  }
}
