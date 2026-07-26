# Global Configuration and Sorting

Global options for the PR Reviewer can be configured in a central configuration
file located at `~/.stitch/pr-reviewer/config.json`.

---

## Configuration File Structure

The configuration file is a JSON file. It allows configuring the custom ordering
of phase groups in the UI, as well as providing custom instructions for the AI
Critic.

### Example `config.json`

```json
{
  "groups": ["Security", "Performance", "Style"],
  "criticInstruction": "Please do not reject comments that mention code style or formatting."
}
```

### Configuration Options

- **`groups`**: (Optional) An array of strings defining the sorting priority of
  phase groups.
- **`criticInstruction`**: (Optional) A string containing custom instructions
  that are included in the AI Critic's prompt during the Critic Phase, allowing
  the user to guide the critic's evaluations.\
  Some example scenarios:
  - If your review agents are told to start every comment with "**Rule: {rule
    name}**" from its review phase documentation, you can tell the critic to
    1. Not remove this preface when editing comments
    2. Discard the comment if it doesn't match the rule stated as being broken
       (e.g. "Rule: Code must be written defensively - this variable is
       misnamed")
  - Your review rules comply with BCP 14 or similar strict language. You can
    tell the critic to never discard a comment pointing out a "MUST" as being a
    nitpick, since the rule is prohibitory. For example, if a review agent
    generates a comment like "Rule: variable names MUST be written in camelCase
    -> This variable my_var is noncompliant", without the instruction, it may be
    seen as nitpicky and discarded, but the critic will see that the rule says
    "MUST" and hence not discard it.

---

## Phase Sorting Rules

When Stitch loads review phases from disk, it sorts them to determine the order
they appear in the UI and the order in which they execute. Sorting follows a
deterministic, three-tiered hierarchy:

### 1. Ungrouped First

Any phase that does not define a `group` property in its frontmatter (or defines
it as `"Ungrouped"`) is placed at the beginning of the list.

### 2. Group Ordering (`config.json`)

For phases that specify a group:

- If a group is listed in the `groups` array in `config.json`, it is sorted
  according to its index in that array.
- If a group is not listed in `config.json`, it is sorted alphabetically.
- Groups listed in `config.json` always take precedence and are sorted before
  groups that are not listed in the configuration file.

### 3. Filename Alphabetical Sort (Tie-breaker)

Within the same group (including `"Ungrouped"`):

- Phases are sorted alphabetically by their filename (e.g.,
  `010-definition-of-done.md` will run before `020-security.md`).
- Using a numeric prefix (e.g., `010-`, `020-`) in your filenames is the
  recommended way to enforce a strict sequential execution order.
