# Product Vision

## Purpose
This document states the high-level product direction for the application. It should guide future requirements, design, and implementation choices while leaving detailed workflows, permissions, business rules, and technical architecture to their dedicated documents.

## Product Direction
The application is primarily a knowledge-management and planning-support tool for liturgical music in one local congregation. It is not just a hymn picker.

Its core purpose is to preserve and make usable the practical organist and domain knowledge that currently lives mostly in one person's head: known songs, playable repertoire, melody relationships, preferences, historical use, antiphon and season associations, and other planning context.

Planning is one important consumer of that knowledge. The product should help people prepare a concrete ordered service set for one service, but it should not replace human judgment.

## Problem Statement
As repertoire and contextual knowledge grow, planning becomes harder when that knowledge is scattered, implicit, or remembered by only one person. This creates repeated communication, repeated explanation, and high cognitive load for the priest and organist.

The product should reverse that pattern by turning accumulated knowledge into shared planning support. It should make relevant information visible at the point of selection so that routine clarification and back-and-forth communication are reduced.

## Target Users
- **Priest** — makes the final liturgical selection and needs clear, trustworthy planning context.
- **Organist** — maintains practical repertoire knowledge and needs planning to reflect what can actually be played.
- **Admin** — maintains shared domain knowledge and configuration so the system remains accurate.
- **Congregation member** — contributes preference information without administering planning or knowledge.

## Value Proposition
The product supports better service planning by combining preserved domain knowledge with practical candidate support.

It should help planners by:

- filtering candidates through repertoire, service language, melody non-repetition, and preference threshold;
- showing repertoire knowledge clearly, including when the playable song is represented through a melody-equivalent song in another language;
- treating song identity as `(language, number)` so Czech and Polish hymn-book entries remain distinct;
- treating melody as equivalence between songs, so different song entries sharing a melody are understood together;
- using antiphon and liturgical season as manual contextual inputs that highlight relevant candidates rather than hard-filtering the list;
- surfacing preferences and contextual signals without turning them into automatic decisions.

The result should be a concrete ordered service set for one service, prepared with better context and less repeated coordination.

## Human Decision Principle
The application stores and presents knowledge; people make decisions.

The final liturgical selection remains a human responsibility, especially the priest's responsibility. The system should improve decision quality, reduce avoidable effort, and reveal relevant context, but it should not automatically choose the final service set or constrain legitimate pastoral judgment beyond accepted planning rules.

## Success Outcomes
The product is successful when:

- important organist and liturgical-music planning knowledge is preserved in the system instead of depending on personal memory;
- a larger repertoire makes planning easier rather than harder;
- priest and organist communication shifts away from repeated discovery and clarification toward confirmation of an informed plan;
- planners can produce a concrete ordered service set for one service with lower cognitive load;
- candidate lists make repertoire, melody non-repetition, preferences, antiphon context, and liturgical-season context visible in a useful way;
- the final selection remains transparent and human-owned.

## Scope Boundaries
Current product scope is one local congregation.

In scope at the product-vision level:

- preserving song, melody-equivalence, repertoire, preference, antiphon-mapping, liturgical-season, and historical planning knowledge;
- supporting planning of one concrete ordered service set for one service;
- reducing repeated communication and cognitive load for priest and organist;
- supporting the roles priest, organist, admin, and congregation member.

Out of scope for this document:

- detailed permission tables;
- detailed workflows and lifecycle rules;
- database schema or application architecture;
- roadmap, backlog, implementation tasks, tests, or UI component design;
- multi-congregation product generalization, which remains intentionally deferred.

## Assumptions and Risks
Key assumptions:

- The most valuable product knowledge is practical planning knowledge, not only a catalog of hymns.
- Human liturgical judgment remains essential even when the system provides strong recommendations and highlights.
- Manual contextual inputs for antiphon and liturgical season are acceptable because they cannot be reliably derived from service date.
- Keeping the first product focused on one local congregation will produce clearer decisions than prematurely generalizing.

Key risks:

- If knowledge maintenance is too burdensome, the system may not stay trustworthy.
- If the product appears to make decisions automatically, users may lose appropriate ownership of the final liturgical selection.
- If the product becomes too detailed at the planning surface, it may increase cognitive load instead of reducing it.

## Open Questions
Open product questions should be tracked in the appropriate source documents as they become requirements, workflow questions, decisions, or domain-analysis topics. This vision should remain high-level and should be updated only when the accepted product direction changes.
