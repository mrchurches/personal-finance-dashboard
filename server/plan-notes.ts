import type { SqliteDatabase } from "./database";

/**
 * A written fact about how the money is actually handled.
 *
 * Deliberately carries no number and touches no projection. It exists because
 * this repository is public and the personal record therefore cannot be
 * versioned: who a counterparty is, why the last family allowance settles the
 * previous statement, what an envelope is for. Without somewhere to put that,
 * the reasoning survives only in whoever happens to remember it.
 */
export interface PlanNote {
  id: number;
  title: string;
  body: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PlanNoteRow {
  id: number;
  title: string;
  body: string;
  pinned: number;
  createdAt: string;
  updatedAt: string;
}

const planNoteSelect = `
  SELECT
    id,
    title,
    body,
    pinned,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM plan_notes
`;

function toPlanNote(row: PlanNoteRow): PlanNote {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    pinned: row.pinned === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listPlanNotes(database: SqliteDatabase): PlanNote[] {
  return database
    .prepare<[], PlanNoteRow>(`${planNoteSelect} ORDER BY pinned DESC, updated_at DESC, id DESC`)
    .all()
    .map(toPlanNote);
}

export interface PlanNoteInput {
  title: string;
  body: string;
  pinned: boolean;
}

export function createPlanNote(
  database: SqliteDatabase,
  input: PlanNoteInput,
  timestamp: string,
): PlanNote {
  if (input.title.trim().length === 0) {
    throw new Error("A note needs a title.");
  }

  const result = database
    .prepare<{ title: string; body: string; pinned: number; timestamp: string }, void>(
      `INSERT INTO plan_notes (title, body, pinned, created_at, updated_at)
       VALUES (@title, @body, @pinned, @timestamp, @timestamp)`,
    )
    .run({
      title: input.title.trim(),
      body: input.body,
      pinned: input.pinned ? 1 : 0,
      timestamp,
    });

  const created = database
    .prepare<[number], PlanNoteRow>(`${planNoteSelect} WHERE id = ?`)
    .get(Number(result.lastInsertRowid));
  if (created === undefined) {
    throw new Error("The created note could not be read back.");
  }

  return toPlanNote(created);
}

/**
 * Rewrites a note in place, keeping `created_at`.
 *
 * Edited rather than versioned on purpose: a note is the current understanding
 * of something, and a history of superseded understandings would bury the one
 * line that matters. What changed is what the note now says.
 */
export function updatePlanNote(
  database: SqliteDatabase,
  id: number,
  input: PlanNoteInput,
  timestamp: string,
): PlanNote {
  if (input.title.trim().length === 0) {
    throw new Error("A note needs a title.");
  }

  const result = database
    .prepare<{ id: number; title: string; body: string; pinned: number; timestamp: string }, void>(
      `UPDATE plan_notes
       SET title = @title, body = @body, pinned = @pinned, updated_at = @timestamp
       WHERE id = @id`,
    )
    .run({
      id,
      title: input.title.trim(),
      body: input.body,
      pinned: input.pinned ? 1 : 0,
      timestamp,
    });

  if (result.changes === 0) {
    throw new Error("The note does not exist.");
  }

  const updated = database.prepare<[number], PlanNoteRow>(`${planNoteSelect} WHERE id = ?`).get(id);
  if (updated === undefined) {
    throw new Error("The updated note could not be read back.");
  }

  return toPlanNote(updated);
}

export function deletePlanNote(database: SqliteDatabase, id: number): { deleted: number } {
  const result = database
    .prepare<[number], void>("DELETE FROM plan_notes WHERE id = ?")
    .run(id);

  return { deleted: result.changes };
}
