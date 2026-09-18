// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Zod schemas for the two parameters almost every tool takes.
//
// `project` appeared as a hand-written `z.string().optional().describe(...)` in
// 109 places and `team` in 48, in four slightly different wordings, each
// spelling out that the value is a name or an ID and that omitting it triggers
// an elicitation. Repeated across the tool list, that sentence was written 342
// times — roughly 4k tokens of the model's context on every request — to say
// the same thing every time.
//
// The description is removed entirely here: that "project" and "team" take a
// name or an ID, and how a missing value is resolved, is a property of the
// server, not of each parameter, and it is stated once in the `instructions`
// text (see server-instructions.ts) instead.

import { z } from "zod";

/** `project`, resolved from the env default or an elicitation when omitted. */
export const optionalProject = z.string().optional();

/** `project`, where the tool cannot sensibly guess one. */
export const requiredProject = z.string();

/** `team`, resolved from the env default or an elicitation when omitted. */
export const optionalTeam = z.string().optional();

/** `team`, where the tool cannot sensibly guess one. */
export const requiredTeam = z.string();

/**
 * `project` or `team` with a clause the caller has to know about — an
 * ownership rule, or what happens in this particular tool when it is omitted.
 */
export const optionalProjectWith = (note: string) => z.string().optional().describe(note);
export const requiredProjectWith = (note: string) => z.string().describe(note);
export const optionalTeamWith = (note: string) => z.string().optional().describe(note);

/** `processId` of the witprocess_ tools. */
export const processIdParam = z.string().describe("The ID (GUID) of the process.");

/** `witRefName` — a work item type inside a process. */
export const witRefNameParam = z.string().describe("The reference name of the work item type, e.g. 'MyProcess.Bug'.");

/** An opaque paging token handed back by the previous page. */
export const continuationTokenParam = z.string().optional().describe("Continuation token from a previous response, to fetch the next page.");
