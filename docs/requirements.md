# Requirements

## Purpose
Use this document to capture functional and non-functional requirements before implementation.

## Requirement Format
Define the preferred structure for requirements, such as identifier, title, rationale, priority, acceptance criteria, and status.

## Functional Requirements
List user-facing capabilities and expected behaviors.

### Service Completion Records
- Priest and admin users may convert a final set to a completed-service record.
- The system may also convert a final set to a completed-service record automatically after a default time.
- The default time and detailed automatic-conversion behavior are open workflow and product questions; automatic conversion is not fully specified yet.

## Non-Functional Requirements
Capture performance, reliability, accessibility, security, privacy, maintainability, and compliance expectations.

## User Stories
Describe user goals in a consistent story format when useful.

## Acceptance Criteria
Document testable conditions that must be met for each requirement.

### Service Completion Records
- Given a final set exists, when a priest or admin chooses to convert it, then the system records it as a completed service.
- Given a final set exists beyond a default time, the system may automatically convert it to a completed-service record, subject to the unresolved product and workflow definition for that timing and behavior.

## Constraints
List business, technical, legal, operational, or platform constraints.

## Traceability
Explain how requirements should link to roadmap items, backlog tasks, decisions, tests, and releases.
