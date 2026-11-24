import { describe, expect, it } from 'vitest';
import type { EventSetup } from '../generated/event-setup.js';
import { newEventSetup } from '../setup-defaults.js';
import { readEntryList, ImportError, type SourceTable } from './extract.js';
import { planImport, tidyClass, tidyName } from './plan.js';
import { IMPORT_PRESETS, checkPreset, detectPreset } from './presets.js';

// Synthetic entry lists. The headers are the entry systems' real column names; every name,
// number and value below is invented. Never paste rows from a real export into a test.

/** Ridernet's eventRiders export headers (the 56-column form; some files lack is_suspended). */
export const RIDERNET_HEADERS = [
  'registrationDate', 'eventId', 'ClassId', 'originalClassId', 'Event_Name', 'First_Name',
  'Last_Name', 'RidernetID', 'DOB', 'Gender', 'Phone', 'Email', 'State', 'Club', 'Grades',
  'eventEndDate', 'Ambulance_Fund', 'Policy_Number', 'Policy_Expiry', 'Emergency_Contact_Name',
  'Emergency_Contact_Relationship', 'Emergency_Contact_Phone', 'is_participant',
  'Suspension_Type', 'Suspended_To', 'is_suspended', 'Licence_Type', 'Licence_Expiry',
  'Licence', 'Endorsement', 'is_active', 'message', 'riderFormDataId', 'riderUserDataId',
  'approved', 'Event_Role', 'Primary_Rider', 'Entrant', 'Event_Class_Name',
  'Event_Class_Description', 'Class_Reg_Status', 'Race_Plate', 'Riding_Number', 'Sponsor',
  'FIM_Licence', 'FIM_Expiry_Date', 'Class_Price', 'Class_Amount', 'Bike_Eng_Cap', 'Bike_Make',
  'Bike_Model', 'Bike_VIN', 'Bike_EngNo', 'Transponder_Name', 'Transponder_Number', 'userName',
]; // prettier-ignore

export const ENTRYPLACE_HEADERS = [
  'Date', 'Entry Form Reference', 'First Name', 'Last Name', 'Class', 'Club', 'Competitive',
  'Licence Number', 'Licence Expiry', 'Licence Notes', 'Senior', 'Junior', 'Phone', 'Email',
  'Address', 'Date of Birth', 'Existing Medical Conditions', 'Entry Group', 'Entrant Notes',
  'Machine', 'Emergency Contact', 'Emergency Contact Phone',
]; // prettier-ignore

type Cells = Record<string, string>;
const table = (headers: string[], rows: Cells[], sheet?: string): SourceTable => ({
  ...(sheet ? { sheet } : {}),
  rows: [headers, ...rows.map((r) => headers.map((h) => r[h] ?? ''))],
});

const ridernetRow = (o: Cells): Cells => ({
  Event_Role: 'Rider',
  Class_Reg_Status: 'Active',
  Licence_Type: 'SRN',
  Club: 'Example Trials Club',
  DOB: '01/01/1990',
  Phone: '0400 000 000',
  Emergency_Contact_Name: 'Someone Else',
  Riding_Number: 'Alex Example',
  ...o,
});

const ridernet = table(RIDERNET_HEADERS, [
  ridernetRow({ First_Name: 'Avery', Last_Name: 'Stone', RidernetID: '900001', Event_Class_Name: 'Trial 4', ClassId: '11' }),
  ridernetRow({ First_Name: 'Blake', Last_Name: 'River', RidernetID: '900002', Event_Class_Name: 'Trial 4', ClassId: '10', Licence_Type: 'JRN' }),
  ridernetRow({ First_Name: 'Casey', Last_Name: 'Hill', RidernetID: '900003', Event_Class_Name: 'Trial 4 Plus' }),
  ridernetRow({ First_Name: 'Casey', Last_Name: 'Hill', RidernetID: '900003', Event_Class_Name: 'Trial 4' }),
  ridernetRow({ First_Name: 'Drew', Last_Name: 'Field', RidernetID: '900004', Event_Class_Name: 'Trial 1' }),
  ridernetRow({ First_Name: 'Drew', Last_Name: 'Field', RidernetID: '900004', Event_Class_Name: 'TMTC Minder' }),
  ridernetRow({ First_Name: 'Emery', Last_Name: 'Lake', RidernetID: '900005', Event_Class_Name: 'Trial 2', Event_Role: 'Crew', Class_Reg_Status: '' }),
  ridernetRow({ First_Name: 'Finley', Last_Name: 'Glen', RidernetID: '900006', Event_Class_Name: 'TMTC Minder', Class_Reg_Status: 'Withdrawn' }),
  ridernetRow({ First_Name: 'Gray', Last_Name: 'Moss', RidernetID: '900007', Event_Class_Name: 'TMTC SNR Non Comp', Licence_Type: 'OREC' }),
  ridernetRow({ First_Name: 'Harper', Last_Name: 'Vale', RidernetID: '900008', Event_Class_Name: 'Twinshock', Licence_Type: '' }),
  ridernetRow({ First_Name: 'Indy', Last_Name: 'Brook', RidernetID: '900009', Event_Class_Name: 'TMTC Trial 6 JNR (Up to 200CC)', Licence_Type: 'JRN' }),
]); // prettier-ignore

/** A Victorian-style setup with Juniors, plus Twinshock. */
function setup(extra: Partial<EventSetup> = {}): EventSetup {
  const s = newEventSetup('2027-02-06');
  const base = s.classes.find((c) => c.name === 'Trial 4');
  return {
    ...s,
    event: { name: 'Example Club Trial', code: 'ECT' },
    classes: [...s.classes, { ...base, name: 'Twinshock', order: 65, days: base?.days ?? {} }],
    ...extra,
  };
}

describe('presets', () => {
  it('every shipped preset is valid and has a unique id', () => {
    expect(IMPORT_PRESETS.map((p) => p.id)).toEqual([
      'entryplace',
      'ridernet',
      'tscore-rider-list',
    ]);
  });

  it('a rule must say exactly one of in, not_in and pattern', () => {
    const bad = {
      ...IMPORT_PRESETS[1],
      skip_rows: [{ field: 'role', in: ['Crew'], not_in: ['Rider'], reason: 'crew' }],
    };
    expect(() => checkPreset(bad)).toThrow(/exactly one/);
  });

  it('recognises each export from its header row, in any case', () => {
    expect(detectPreset(RIDERNET_HEADERS)?.id).toBe('ridernet');
    expect(detectPreset(ENTRYPLACE_HEADERS.map((h) => h.toUpperCase()))?.id).toBe('entryplace');
    expect(detectPreset(['Number', 'Given name', 'Family name', 'Class'])?.id).toBe(
      'tscore-rider-list',
    );
    expect(detectPreset(['Name', 'Grade'])).toBeUndefined();
  });
});

describe('reading an entry list', () => {
  it('keeps only the columns the preset reads: no DOB, phone, contacts or typed numbers', () => {
    const list = readEntryList([ridernet]);
    expect(list.source).toBe('Ridernet export');
    const keys = new Set(list.rows.flatMap((r) => Object.keys(r)));
    expect([...keys].sort()).toEqual(
      ['class', 'club', 'family_name', 'given_name', 'licence', 'licence_type', 'line', 'role', 'status'],
    ); // prettier-ignore
    expect(JSON.stringify(list)).not.toMatch(/1990|0400|Someone Else|Alex Example/);
  });

  it('copes with a column missing that it does not need', () => {
    const headers = RIDERNET_HEADERS.filter((h) => h !== 'is_suspended');
    const list = readEntryList([table(headers, [ridernetRow({ First_Name: 'A', Last_Name: 'B', Event_Class_Name: 'Trial 1' })])]);
    expect(list.rows).toHaveLength(1);
  }); // prettier-ignore

  it("uses Entryplace's Entry List sheet even when it isn't first", () => {
    const takings = table(['Date', 'Amount'], [{ Date: 'x', Amount: '1' }], 'Takings');
    const entries = table(ENTRYPLACE_HEADERS, [{ 'First Name': 'Avery', 'Last Name': 'Stone', Class: 'Trial 1 (Expert)' }], 'Entry List');
    expect(readEntryList([takings, entries]).presetId).toBe('entryplace');
  }); // prettier-ignore

  it('refuses a file it does not recognise, in plain words', () => {
    const t = table(['Name', 'Grade'], [{ Name: 'x', Grade: 'y' }]);
    expect(() => readEntryList([t])).toThrow(ImportError);
    expect(() => readEntryList([t])).toThrow(/doesn't recognise this file/);
  });
});

describe('planning the import (Ridernet)', () => {
  const list = readEntryList([ridernet]);

  it('skips crew, minders and withdrawn entries, and says how many', () => {
    const plan = planImport(list, setup(), []);
    expect(plan.rowsRead).toBe(11);
    expect(plan.skipped).toEqual([
      { reason: 'minders', count: 1 },
      { reason: 'crew', count: 1 },
      { reason: 'withdrawn entries', count: 1 },
    ]);
  });

  it('matches class names, including the known Ridernet ones, and ignores the ClassId split', () => {
    const plan = planImport(list, setup(), []);
    const by = Object.fromEntries(plan.classes.map((c) => [c.raw, [c.className, c.by]]));
    expect(by['Trial 4']).toEqual(['Trial 4', 'name']);
    expect(by['TMTC Trial 6 JNR (Up to 200CC)']).toEqual(['Juniors', 'preset']);
    expect(by['TMTC SNR Non Comp']).toEqual(['Trial 5', 'preset']);
    expect(by['Twinshock']).toEqual(['Twinshock', 'name']);
  });

  it('every class is competitive; only an OREC licence makes a rider NC', () => {
    const plan = planImport(list, setup(), [], { duplicates: { 'L:900003': ['Trial 4'] } });
    const competitionStatus = (family: string) => plan.entries.find((e) => e.riders[0]?.familyName === family)?.competitionStatus;
    expect(competitionStatus('Moss')).toBe('non_competitive');
    expect(competitionStatus('Brook')).toBe('competitive');
    expect(competitionStatus('River')).toBe('competitive');
    expect(competitionStatus('Vale')).toBe('competitive');
  }); // prettier-ignore

  it('asks about someone entered in two classes, and waits for the answer', () => {
    const plan = planImport(list, setup(), []);
    expect(plan.duplicates).toEqual([
      { key: 'L:900003', name: 'Casey Hill', classes: ['Trial 4 Plus', 'Trial 4'], chosen: null },
    ]);
    expect(plan.ready).toBe(false);
    expect(plan.entries.some((e) => e.riders[0]?.familyName === 'Hill')).toBe(false);

    const one = planImport(list, setup(), [], { duplicates: { 'L:900003': ['Trial 4'] } });
    expect(one.ready).toBe(true);
    expect(one.entries.find((e) => e.riders[0]?.familyName === 'Hill')?.classes).toEqual(['Trial 4']);

    const both = planImport(list, setup(), [], { duplicates: { 'L:900003': ['Trial 4 Plus', 'Trial 4'] } });
    expect(both.entries.find((e) => e.riders[0]?.familyName === 'Hill')?.classes).toEqual(['Trial 4 Plus', 'Trial 4']);
  }); // prettier-ignore

  it('numbers riders by class order, then family name, then given name', () => {
    const plan = planImport(list, setup(), [], { duplicates: { 'L:900003': ['Trial 4'] } });
    expect(plan.entries.map((e) => [e.number, e.classes[0], e.riders[0]?.familyName])).toEqual([
      [1, 'Trial 1', 'Field'],
      [2, 'Trial 4', 'Hill'],
      [3, 'Trial 4', 'River'],
      [4, 'Trial 4', 'Stone'],
      [5, 'Trial 5', 'Moss'],
      [6, 'Twinshock', 'Vale'],
      [7, 'Juniors', 'Brook'],
    ]);
    expect(plan.entries[0]?.riders[0]?.licence).toBe('900004');
  });

  it('starts from the event’s first rider number', () => {
    const s = setup();
    const plan = planImport(list, { ...s, event: { ...s.event, first_rider_number: 101 } }, [], {
      duplicates: { 'L:900003': ['Trial 4'] },
    });
    expect(plan.entries[0]?.number).toBe(101);
  });
});

describe('planning the import (Entryplace)', () => {
  const rows: Cells[] = [
    { 'First Name': 'avery', 'Last Name': 'STONE', Class: 'Trial 4+ (C+ Grade)', Competitive: 'Y', 'Licence Number': '900101', 'Entry Group': 'Solo' },
    { 'First Name': 'Avery', 'Last Name': 'Stone', Class: 'Trial 4+ (C+ Grade)', Competitive: 'Y', 'Licence Number': '900101', 'Entry Group': 'Solo' },
    { 'First Name': 'Blake', 'Last Name': 'River', Class: 'Observer', 'Licence Number': 'None', 'Entry Group': 'Observer' },
    { 'First Name': 'Casey', 'Last Name': 'Hill', Class: 'Juniors (under 16 yo)', Competitive: 'N', 'Licence Number': '900103', 'Entry Group': 'Junior' },
    { 'First Name': 'Drew', 'Last Name': 'Field', Class: 'Clubman (Open)', Competitive: 'Y', 'Licence Number': 'None', 'Entry Group': 'Solo' },
    { 'First Name': 'Emery', 'Last Name': 'Lake', Class: 'Clubman (Open)', Competitive: 'Y', 'Entry Group': 'Solo' },
    { 'First Name': '', 'Last Name': '', Class: '' },
  ]; // prettier-ignore
  const list = readEntryList([table(ENTRYPLACE_HEADERS, rows, 'Entry List')]);

  it('skips observers, merges a repeated entry, and tidies names typed in one case', () => {
    const plan = planImport(list, setup(), [], { classes: { 'Clubman (Open)': 'Trial 5' } });
    expect(plan.rowsRead).toBe(6);
    expect(plan.skipped).toEqual([{ reason: 'observers', count: 1 }]);
    expect(plan.merged).toBe(1);
    expect(plan.entries.find((e) => e.riders[0]?.licence === '900101')?.riders[0]).toEqual({
      givenName: 'Avery',
      familyName: 'Stone',
      licence: '900101',
    });
  });

  it('reads Competitive = N as NC', () => {
    const plan = planImport(list, setup(), [], { classes: { 'Clubman (Open)': 'Trial 5' } });
    expect(plan.entries.find((e) => e.riders[0]?.familyName === 'Hill')?.competitionStatus).toBe(
      'non_competitive',
    );
  });

  it('stops at a class name it does not know, until the desk picks one', () => {
    const before = planImport(list, setup(), []);
    expect(before.classes.find((c) => c.raw === 'Clubman (Open)')).toMatchObject({
      className: null,
      by: 'unknown',
      riders: 2,
    });
    expect(before.ready).toBe(false);

    const after = planImport(list, setup(), [], { classes: { 'clubman (open)': 'Trial 5' } });
    expect(after.ready).toBe(true);
    expect(after.newAliases).toEqual([{ className: 'Trial 5', alias: 'Clubman (Open)' }]);

    const once = planImport(list, setup(), [], {
      classes: { 'Clubman (Open)': 'Trial 5' },
      dontKeep: ['Clubman (Open)'],
    });
    expect(once.newAliases).toEqual([]);
  });

  it('can leave a class out', () => {
    const plan = planImport(list, setup(), [], { classes: { 'Clubman (Open)': null } });
    expect(plan.ready).toBe(true);
    expect(plan.entries).toHaveLength(2);
    expect(plan.skipped).toContainEqual({ reason: 'classes left out', count: 2 });
  });

  it("uses an alias saved in the event's setup", () => {
    const s = setup();
    const withAlias = {
      ...s,
      classes: s.classes.map((c) => (c.name === 'Trial 5' ? { ...c, aliases: ['Clubman (Open)'] } : c)),
    }; // prettier-ignore
    const plan = planImport(list, withAlias, []);
    expect(plan.classes.find((c) => c.raw === 'Clubman (Open)')?.by).toBe('event_alias');
    expect(plan.ready).toBe(true);
  });

  it('adds only new people to an event that already has riders, numbering after them', () => {
    const existing = [
      {
        number: 12,
        riders: [{ givenName: 'Someone', familyName: 'Different', licence: '900101' }],
        competitionStatus: 'competitive' as const,
        status: 'riding' as const,
        classes: ['Trial 4 Plus'],
      },
      {
        number: 3,
        riders: [{ givenName: 'Casey', familyName: 'Hill' }],
        competitionStatus: 'competitive' as const,
        status: 'riding' as const,
        classes: ['Juniors'],
      },
    ];
    const plan = planImport(list, setup(), existing, { classes: { 'Clubman (Open)': 'Trial 5' } });
    expect(plan.alreadyEntered).toBe(2);
    expect(plan.entries.map((e) => [e.number, e.riders[0]?.familyName])).toEqual([
      [13, 'Field'],
      [14, 'Lake'],
    ]);
  });
});

describe("tScore's rider list", () => {
  const headers = ['Number', 'Given name', 'Family name', 'Class', 'Competition status'];
  it('keeps its own numbers when they are usable', () => {
    const t = table(headers, [
      {
        Number: '40',
        'Given name': 'Avery',
        'Family name': 'Stone',
        Class: 'Trial 1',
        'Competition status': 'NA',
      },
      { Number: '7', 'Given name': 'Blake', 'Family name': 'River', Class: 'Trial 2' },
    ]);
    const plan = planImport(readEntryList([t]), setup(), []);
    expect(plan.numbering).toBe('from_file');
    expect(plan.entries.map((e) => [e.number, e.competitionStatus])).toEqual([
      [7, 'competitive'],
      [40, 'no_award'],
    ]);
  });

  it('still reads the older Tier column', () => {
    const t = table(
      ['Number', 'Given name', 'Family name', 'Class', 'Tier'],
      [
        {
          Number: '40',
          'Given name': 'Avery',
          'Family name': 'Stone',
          Class: 'Trial 1',
          Tier: 'NC',
        },
      ],
    );
    const plan = planImport(readEntryList([t]), setup(), []);
    expect(plan.entries.map((e) => [e.number, e.competitionStatus])).toEqual([
      [40, 'non_competitive'],
    ]);
  });

  it('numbers the riders itself when the file repeats a number', () => {
    const t = table(headers, [
      { Number: '7', 'Given name': 'Avery', 'Family name': 'Stone', Class: 'Trial 1' },
      { Number: '7', 'Given name': 'Blake', 'Family name': 'River', Class: 'Trial 2' },
    ]);
    const plan = planImport(readEntryList([t]), setup(), []);
    expect(plan.numbering).toBe('generated');
    expect(plan.notes[0]).toMatch(/numbered the riders/);
    expect(plan.entries.map((e) => e.number)).toEqual([1, 2]);
  });
});

describe('tidying', () => {
  it.each([
    ['Trial 4+ (C+ Grade)', 'Trial 4 Plus'],
    ['Trial 1 (Expert)', 'Trial 1'],
    ['  Juniors   (under 16 yo) ', 'Juniors'],
  ])('class %s → %s', (raw, tidy) => expect(tidyClass(raw)).toBe(tidy));

  it.each([
    ['AVERY', 'Avery'],
    ["o'brien-smith", "O'Brien-Smith"],
    ['McKenzie', 'McKenzie'],
    ['  mary   jane ', 'Mary Jane'],
  ])('name %s → %s', (raw, tidy) => expect(tidyName(raw)).toBe(tidy));
});
