# Privacy Policy

_Last updated: July 2026_

This Privacy Policy describes how Stitch handles data and protects your privacy.

## Local Execution & Data Storage

- **Runs Locally:** Stitch runs entirely on your local device.
- **Secure Storage & No Cloud Storage:** Stitch does not upload or synchronize your data, configuration, credentials (including API keys and Personal Access Tokens (PATs)), or application state to any cloud service or external server. All application data is stored locally on your device. Specifically, credentials (such as API keys and Personal Access Tokens) are encrypted at rest on your device using native platform APIs (such as Keychain on macOS or DPAPI on Windows) to prevent unauthorized local access.

## External Services

Stitch communicates only with services that you explicitly configure and choose to use.

These integrations include:

- **Azure DevOps:** When configured, Stitch connects to Azure DevOps to access and manage your organization's projects, work items, and related resources.
- **GitHub:** When configured, Stitch connects to GitHub to access and manage your repositories, issues, and pull requests.
- **Confluence:** When configured, Stitch connects to Confluence to read, create, and update documentation and wiki content.
- **GitHub Copilot:** AI features use the official GitHub Copilot tooling and APIs. When you invoke an AI-powered feature, Stitch sends your prompt to GitHub Copilot and, where required for the requested task, may provide relevant portions of your local codebase as context. Code is shared only when necessary for the feature to function or when explicitly requested by you (for example, during pull request reviews). The handling of any data sent to GitHub Copilot is governed by GitHub's privacy policy and terms of service.

## Telemetry and Third-Party Tracking

- **No Telemetry:** Stitch does not collect or transmit usage analytics or diagnostic telemetry.
- **Update Checks:** Stitch periodically contacts `update.electronjs.org` to check for application updates. These requests are used only to determine whether a newer version is available and do not include your application data.
- **No Unauthorized Data Sharing:** Stitch does not send your data to any external services other than the services you explicitly configure and use.

## Updates to This Policy

This Privacy Policy may be updated from time to time. Because Stitch does not collect user contact information, any changes will be communicated through application release notes and updates to the project's repository. Privacy Policy updates will take effect from the release after the policy update, and you will be alerted that a change has occurred within the application on the first launch after updating.

## Contact

If you have questions about this Privacy Policy, please open an issue in the Stitch GitHub repository:

https://github.com/thealternator89/stitch/issues
