# Feature: [Name]

## Overview

**User Story**: As a [role], I want [capability] so that [business outcome].

**Problem**: [1-2 sentences: what breaks or is missing without this feature]

**Out of Scope**: [Explicit exclusions to prevent scope creep]

---

## Success Condition

> One sentence: "This feature is complete when [verifiable done-state]."

---

## Open Questions

| # | Question | Raised By | Resolved |
|:--|:---------|:----------|:---------|
| 1 | | | [ ] |

---

## Scope

### Must-Have
- [Behaviour]: [acceptance condition]

### Should-Have
- [Behaviour]

### Nice-to-Have
- [Behaviour]

---

## Technical Plan

**Affected Components**: [services, modules, files]

**Data Model Changes**:
- [New field / table / schema delta]

**API Contracts** (if applicable):
- `[METHOD] /path` — [description, inputs, outputs]

**Dependencies**: [external services, feature flags, migrations]

**Risks**:
| Risk | Likelihood | Mitigation |
|:-----|:-----------|:-----------|
| | | |

---

## Acceptance Scenarios

```gherkin
Feature: [Name]
  As a [role]
  I want [capability]
  So that [business outcome]

  Background:
    Given [shared precondition]

  Rule: [Business rule 1]

    Scenario: [Happy path name]
      Given [precondition]
      When [action]
      Then [expected outcome]
      And [secondary assertion]

    Scenario: [Edge case / failure name]
      Given [precondition]
      When [action]
      Then [expected error or fallback]

  Rule: [Business rule 2]

    Scenario Outline: [Parameterised case]
      Given [setup with <variable>]
      When [action with <input>]
      Then [outcome should be <result>]

      Examples:
        | variable | input | result |
        | ...      | ...   | ...    |
```

---

## Task Breakdown

| ID   | Task | Priority | Dependencies | Status  |
|:-----|:-----|:---------|:-------------|:--------|
| T1   | | High | None | pending |
| T1.1 | | High | None | pending |
| T2   | | Med  | T1   | pending |

---

## Exit Criteria

- [ ] All Must-Have scenarios pass in CI
- [ ] No regressions on related features
- [ ] API contracts match implementation
- [ ] [Domain-specific criterion]

---

## References

- Related specs: [link or N/A]
- Tickets: [link or N/A]
