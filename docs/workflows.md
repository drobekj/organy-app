# Workflows

## Purpose
Use this document to describe important user, business, operational, and development workflows.

## Workflow Format
Define a consistent structure for workflows, including goal, actors, preconditions, steps, exceptions, outputs, and related requirements.

## User Workflows
Capture step-by-step flows for primary user tasks.

## Administrative Workflows
Document management, moderation, configuration, or support processes.

### Final Set to Completed-Service Record
Goal: Convert a final set into the completed-service record used for post-service tracking.

Actors:
- Priest
- Admin
- System, for a possible automatic conversion after a default time

Steps:
1. A final set is available for a service.
2. A priest or admin may convert the final set to a completed-service record.
3. The system may also perform the conversion automatically after a default time.
4. The completed-service record becomes available for the relevant follow-up workflow.

## System Workflows
Describe automated or background processes once they are identified.

## Development Workflows
Record contribution, review, testing, release, and maintenance processes.

## Edge Cases and Exceptions
List alternative paths, failure scenarios, and recovery expectations.

## Open Workflow Questions
Track unclear or incomplete flows that need stakeholder input.

- What default time should pass before the system may automatically convert a final set to a completed-service record?
- What exact checks, notifications, safeguards, or exceptions should apply to automatic conversion? Automatic conversion is allowed as a product direction, but its detailed workflow is not fully specified yet.
