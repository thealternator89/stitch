# Global Configuration and Sorting

Global options for the PR Reviewer can be configured in a central configuration file located at `~/.stitch/pr-reviewer/config.json`.

---

## Configuration File Structure

The configuration file is a JSON file. Currently, its primary function is defining the custom ordering of phase groups in the UI.

### Example `config.json`

```json
{
  "groups": ["Security", "Performance", "Style"]
}
```

---

## Phase Sorting Rules

When Stitch loads review phases from disk, it sorts them to determine the order they appear in the UI and the order in which they execute. Sorting follows a deterministic, three-tiered hierarchy:

### 1. Ungrouped First

Any phase that does not define a `group` property in its frontmatter (or defines it as `"Ungrouped"`) is placed at the beginning of the list.

### 2. Group Ordering (`config.json`)

For phases that specify a group:

- If a group is listed in the `groups` array in `config.json`, it is sorted according to its index in that array.
- If a group is not listed in `config.json`, it is sorted alphabetically.
- Groups listed in `config.json` always take precedence and are sorted before groups that are not listed in the configuration file.

### 3. Filename Alphabetical Sort (Tie-breaker)

Within the same group (including `"Ungrouped"`):

- Phases are sorted alphabetically by their filename (e.g., `010-definition-of-done.md` will run before `020-security.md`).
- Using a numeric prefix (e.g., `010-`, `020-`) in your filenames is the recommended way to enforce a strict sequential execution order.
