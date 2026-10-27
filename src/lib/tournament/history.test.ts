import { describe, expect, it } from "vitest";
import { MERGE_WITHIN_MS, UNDO_LIMIT, emptyHistory, record, redo, undo } from "./history";

/** Records each change a second apart, so none join. */
function changes(values: number[]) {
  let history = emptyHistory<number>();
  let current = 0;
  values.forEach((value, i) => {
    history = record(history, current, (i + 1) * 1000);
    current = value;
  });
  return { history, current };
}

describe("history", () => {
  it("undoes and redoes changes in order", () => {
    const { history, current } = changes([1, 2, 3]);
    const back = undo(history, current)!;
    expect(back.value).toBe(2);
    const back2 = undo(back.history, back.value)!;
    expect(back2.value).toBe(1);
    const forward = redo(back2.history, back2.value)!;
    expect(forward.value).toBe(2);
  });

  it("keeps only the last few changes", () => {
    let { history, current } = changes(Array.from({ length: UNDO_LIMIT + 5 }, (_, i) => i + 1));
    let undone = 0;
    for (let step = undo(history, current); step; step = undo(history, current)) {
      ({ history, value: current } = step);
      undone += 1;
    }
    expect(undone).toBe(UNDO_LIMIT);
    expect(current).toBe(5);
  });

  it("joins changes made close together, such as typing", () => {
    let history = emptyHistory<string>();
    history = record(history, "", 1000);
    history = record(history, "a", 1000 + MERGE_WITHIN_MS / 2);
    history = record(history, "ab", 1000 + MERGE_WITHIN_MS);
    expect(undo(history, "abc")!.value).toBe("");
  });

  it("never joins a change recorded as separate", () => {
    let history = emptyHistory<number>();
    history = record(history, 0, 1000);
    history = record(history, 1, 1100, false);
    history = record(history, 2, 1200);
    expect(history.past).toEqual([0, 1, 2]);
  });

  it("drops what was undone once a new change is made", () => {
    const { history, current } = changes([1, 2]);
    const back = undo(history, current)!;
    const next = record(back.history, back.value, 10_000);
    expect(redo(next, 5)).toBeNull();
  });

  it("has nothing to undo or redo at first", () => {
    expect(undo(emptyHistory<number>(), 0)).toBeNull();
    expect(redo(emptyHistory<number>(), 0)).toBeNull();
  });
});
