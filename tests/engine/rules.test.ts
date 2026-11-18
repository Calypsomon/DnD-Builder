import { describe, expect, it } from "vitest";
import { evalFormula, evalText } from "../../shared/engine/formula";
import { abilityMod, pactSlots, proficiencyBonus, spellSlots } from "../../shared/rules/tables";

describe("formula", () => {
  const ctx = {
    vars: { str: 3, dex: 2, con: 1, wis: 4, cha: -1, pb: 3, level: 6, classLevel: 6 },
    table: (c: string) => ({ Rages: "4", "Martial Arts": "1d6", "Unarmored Movement": "+15 ft." })[c],
  };
  it("evaluates arithmetic and functions", () => {
    expect(evalFormula("10 + dex + con", ctx)).toBe(13);
    expect(evalFormula("max(1, cha)", ctx)).toBe(1);
    expect(evalFormula("wis + floor(level / 4)", ctx)).toBe(5);
    expect(evalFormula("-2 * (pb + 1)", ctx)).toBe(-8);
    expect(evalFormula(7, ctx)).toBe(7);
  });
  it("reads class table columns", () => {
    expect(evalFormula("table:Rages", ctx)).toBe(4);
    expect(evalFormula("table:Unarmored Movement", ctx)).toBe(15);
    expect(evalText("table:Martial Arts", ctx)).toBe("1d6");
  });
  it("rejects unknown variables", () => {
    expect(() => evalFormula("foo + 1", ctx)).toThrow();
    expect(() => evalFormula("process.exit()", ctx)).toThrow();
  });
});

describe("rules tables", () => {
  it("proficiency bonus", () => {
    expect([1, 4, 5, 8, 9, 13, 17, 20].map(proficiencyBonus)).toEqual([2, 2, 3, 3, 4, 5, 6, 6]);
  });
  it("ability modifier", () => {
    expect([1, 8, 9, 10, 11, 15, 20].map(abilityMod)).toEqual([-5, -1, -1, 0, 0, 2, 5]);
  });
  it("full caster slots", () => {
    expect(spellSlots("full", 1).slice(1, 3)).toEqual([2, 0]);
    expect(spellSlots("full", 5).slice(1, 4)).toEqual([4, 3, 2]);
    expect(spellSlots("full", 20).slice(1)).toEqual([4, 3, 3, 3, 3, 2, 2, 1, 1]);
  });
  it("half caster slots (paladin/ranger)", () => {
    expect(spellSlots("half", 1)[1]).toBe(0);
    expect(spellSlots("half", 2)[1]).toBe(2);
    expect(spellSlots("half", 5).slice(1, 3)).toEqual([4, 2]);
    expect(spellSlots("half", 20).slice(1, 6)).toEqual([4, 3, 3, 3, 2]);
  });
  it("third caster slots (eldritch knight)", () => {
    expect(spellSlots("third", 2)[1]).toBe(0);
    expect(spellSlots("third", 3)[1]).toBe(2);
    expect(spellSlots("third", 7).slice(1, 3)).toEqual([4, 2]);
    expect(spellSlots("third", 20).slice(1, 5)).toEqual([4, 3, 3, 1]);
  });
  it("artificer slots", () => {
    expect(spellSlots("artificer", 1)[1]).toBe(2);
    expect(spellSlots("artificer", 5).slice(1, 3)).toEqual([4, 2]);
  });
  it("pact magic", () => {
    expect(pactSlots(1)).toEqual({ slots: 1, level: 1 });
    expect(pactSlots(5)).toEqual({ slots: 2, level: 3 });
    expect(pactSlots(11)).toEqual({ slots: 3, level: 5 });
    expect(pactSlots(17)).toEqual({ slots: 4, level: 5 });
  });
});
