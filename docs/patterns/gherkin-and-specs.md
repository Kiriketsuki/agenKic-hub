# Gherkin and specs

The repo's [feature-spec skill](https://github.com/Kiriketsuki/agenKic-hub/blob/main/skills/feature-spec/SKILL.md) produces feature specifications that use two conventions: Gherkin for acceptance scenarios and MoSCoW for scope. This article explains both, for a reader who has never seen either.

## What Gherkin is

Gherkin is a plain-text language for describing software behavior as concrete examples. Each example states a starting condition, an action, and an expected outcome. The format is readable by anyone, and test frameworks such as Cucumber can execute it directly.

A Gherkin file is built from a few keywords.

### Feature

The top-level block. It names the capability and usually carries a short user story:

```gherkin
Feature: Password reset
  As a locked-out user
  I want to reset my password by email
  So that I can regain access to my account
```

### Scenario and Given / When / Then

A scenario is one concrete example of behavior. Its steps use three keywords:

- **Given** sets up the starting state.
- **When** performs the action under test.
- **Then** states the expected outcome.

```gherkin
Scenario: Reset with a valid email
  Given a registered user with email "user@example.com"
  When the user requests a password reset for "user@example.com"
  Then a reset link is sent to "user@example.com"
  And the link expires after 60 minutes
```

`And` and `But` continue the previous keyword. Write one behavior per scenario. A scenario with two When steps usually hides two scenarios.

### Rule

A `Rule` groups scenarios that illustrate one business rule:

```gherkin
Rule: Reset links are single-use
  Scenario: Using a link twice
    Given a reset link that was already used
    When the user opens the link again
    Then the page shows "This link has expired"
```

### Background

Steps shared by every scenario in a feature move into a `Background` block, which runs before each scenario:

```gherkin
Background:
  Given a registered user with email "user@example.com"
```

### Scenario Outline

A `Scenario Outline` runs the same steps once per row of an `Examples` table. Placeholders in angle brackets take the row values:

```gherkin
Scenario Outline: Password strength validation
  Given a new password "<password>"
  When the user submits the reset form
  Then the result is "<result>"

  Examples:
    | password     | result   |
    | abc          | rejected |
    | correcthorse | accepted |
```

## MoSCoW scope

MoSCoW is a prioritisation scheme. The name comes from its four buckets:

| Bucket | Meaning |
|:---|:---|
| Must-Have | The feature fails without it. Each entry carries an acceptance condition. |
| Should-Have | Important, but the feature ships without it if time runs out. |
| Could-Have (Nice-to-Have) | Desirable extras. First to be cut. |
| Won't-Have | Explicitly out of scope, written down to prevent scope creep. |

The value is in the disagreements it forces early. When everything is a Must-Have, nothing is.

## How the feature-spec skill uses them

The skill interviews the user section by section and fills a template. A finished spec contains:

- **Overview**: user story, problem statement, and explicit out-of-scope exclusions.
- **Success condition**: one sentence, "This feature is complete when [verifiable state]." Every later scope dispute refers back to it.
- **Scope**: MoSCoW buckets. Must-Have entries pair a behavior with an acceptance condition.
- **Technical plan**: affected components, data model changes, API contracts, and dependencies.
- **Acceptance scenarios**: a Gherkin block with a happy path, edge and failure cases, and scenario outlines for parameterised cases.
- **Exit criteria**: a checklist that includes "all Must-Have scenarios pass in CI."

## How to read a spec produced by these skills

1. Read the success condition first. It is the contract.
2. Check the Must-Have list. That is what the implementation must deliver.
3. Read the Gherkin scenarios as the test plan. Each scenario should trace to at least one automated test.
4. Treat Won't-Have and out-of-scope entries as binding. Work that touches them needs a new spec.

The [implement-spec skill](https://github.com/Kiriketsuki/agenKic-hub/blob/main/skills/implement-spec/SKILL.md) consumes these specs and turns the scenarios into tasks for subagents.
