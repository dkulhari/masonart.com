/**
 * Taking our own data back out of somebody else's sentence (#726).
 *
 * `lib/payload-echo-scrub.ts` is the code that decides whether a customer's
 * name, street, phone and email reach the log aggregator when a third party
 * quotes our payload back at us. It lived inside `services/shiprocket.ts`,
 * where it was the most delicate subsystem in the file and the only one
 * nothing mechanically pinned: three passes of regular expressions, asserted
 * by prose and exercised only through two courier writes, on the path where
 * being wrong writes a street address into an aggregator permanently.
 *
 * ## What this file tests that a behavioural test through the client cannot
 *
 * A test that drives `createCourierOrder` can only ever assert *this fixture's*
 * values did not appear. It cannot say which pass caught them, cannot show a
 * pass is load-bearing, and cannot exercise the shapes the fixture happens not
 * to contain. So every pass here is driven directly, each with a planted input
 * it must catch AND a paired input it must leave alone — a scrubber that
 * replaced everything would satisfy "no PII in the log" and would be useless.
 *
 * ## The claim the module makes, and where it is checked
 *
 * *No value we put on the wire survives, and when the heuristics cannot show
 * that, nothing is returned at all.* The first half is three heuristics and is
 * not a proof; the second half is `survivingEchoes`, which re-reads the output
 * and fails closed. `withheld` is how the caller learns which of the two
 * happened.
 *
 * ## Style
 *
 * Single quotes with semicolons, which is `services/shiprocket.ts`'s punctuation
 * rather than `lib/vendor-scope.ts`'s. Deliberate: this is that file's code,
 * moved, and keeping its punctuation is what makes the move readable as a move.
 *
 * @see packages/api/src/lib/payload-echo-scrub.ts
 * @see packages/api/src/services/shiprocket.ts
 * @see packages/api/tests/services/shiprocket-courier-writes.test.ts
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import * as scrubber from '../../src/lib/payload-echo-scrub';
import {
  ECHO_MIN_LENGTH,
  RESIDUE_MIN_LENGTH,
  payloadEchoes,
  scrubEchoedValues,
  survivingEchoes,
  type EchoedField,
} from '../../src/lib/payload-echo-scrub';

/**
 * The consignee half of a courier payload, shaped like the real one.
 *
 * Field names are Shiprocket's because the placeholders are what an operator
 * reads in the log line, and a fixture that renamed them would be testing a
 * vocabulary nobody uses.
 */
const PAYLOAD: Record<string, unknown> = {
  order_id: 'CHB-2026-000412-b3d9f1a4',
  billing_customer_name: 'Ananya Iyer',
  billing_address: '12 Turner Road',
  billing_address_2: 'Bandra West',
  billing_city: 'Mumbai',
  billing_pincode: '400050',
  billing_phone: '9820011223',
  billing_email: 'ananya@example.test',
  shipping_is_billing: true,
  order_items: [
    { name: 'A2 Poster - Kerala Backwaters', sku: 'PST-A2-KER', units: 2, selling_price: 1499 },
  ],
  weight: 0.85,
};

const ECHOES = payloadEchoes(PAYLOAD);

/** The scrubbed text alone, for the cases where `withheld` is the boring half. */
const scrub = (message: string, echoes: readonly EchoedField[] = ECHOES): string =>
  scrubEchoedValues(message, echoes).text;

// ============================================================================
// The vocabulary is walked off the payload, never listed beside it
// ============================================================================

describe('payloadEchoes', () => {
  it('walks the object that was actually sent', () => {
    // The property that keeps this module honest as the payload grows. The
    // vocabulary used to be a hand-kept second enumeration of the consignee,
    // documented as derived and not derived: a field added to the payload lost
    // its scrubbing silently, with the compiler quiet and every test green.
    const fields = ECHOES.map((echo) => echo.field);

    expect(fields).toContain('billing_customer_name');
    expect(fields).toContain('billing_email');
    expect(fields).toContain('order_items');
  });

  it('attributes a nested string to the TOP-LEVEL key it sits under', () => {
    // An item name quoted back reads `[order_items]`, not `[name]`. The field
    // name is here to tell an operator where to look, not to reconstruct the
    // path — and `name` on its own would not tell them anything.
    const item = ECHOES.filter((echo) => echo.field === 'order_items').map((echo) => echo.value);

    expect(item).toContain('A2 Poster - Kerala Backwaters');
    expect(item).toContain('PST-A2-KER');
  });

  it('collects strings and deliberately not numbers or booleans', () => {
    // Every number in a courier payload is a dimension or an amount of money;
    // none of them identifies a person, and masking short numeric runs turns a
    // diagnostic sentence into placeholders. The numbers that DO identify — a
    // pincode, a phone — are strings here because they are strings in the
    // schema, and they are picked up as strings.
    const values = ECHOES.map((echo) => echo.value);

    expect(values).not.toContain('0.85');
    expect(values).not.toContain('true');
    expect(values).not.toContain('1499');
    expect(values).toContain('400050');
  });
});

// ============================================================================
// Pass 1 — the whole value, whitespace-tolerant, longest first
// ============================================================================

describe('the whole-value pass', () => {
  it('replaces a value with the NAME of the field it went out in', () => {
    // More diagnostic than dropping the sentence, not less: an operator is
    // told which field the complaint is about and can go and fix that field.
    expect(scrub('Invalid phone for Ananya Iyer at 12 Turner Road')).toBe(
      'Invalid phone for [billing_customer_name] at [billing_address]'
    );
  });

  it('survives whitespace a validator collapsed on the way back', () => {
    // Measured: a consignee typed a double space into a form, nothing here
    // normalises it, so we sent it and Shiprocket quoted it back single-spaced.
    // An exact substring replace matched nothing, and no shape matches a street
    // name, so the address reached the aggregator through the strong pass.
    const echoes = payloadEchoes({ billing_address: '12  Turner  Road' });

    expect(scrub('12 Turner Road is not deliverable', echoes)).toBe(
      '[billing_address] is not deliverable'
    );
  });

  it('replaces the longest value first, so a city inside a street stays inside it', () => {
    // Order matters where one value contains another. Shortest-first would
    // report a street address as `12 Turner [billing_city]`, which names the
    // wrong field for an operator to go and fix.
    const echoes = payloadEchoes({
      billing_city: 'Turner',
      billing_address: '12 Turner Road',
    });

    expect(scrub('at 12 Turner Road', echoes)).toBe('at [billing_address]');
  });

  it('matches a digit run re-punctuated in the middle', () => {
    // Measured, and it defeated all three passes: `9820011223` came back as
    // `98200 11223` — what a validator that formats numbers does. Pass 1
    // tolerated collapsing and found nothing to collapse; pass 2 keys on whole
    // words and the value is ONE word; the shape net wanted ten contiguous
    // digits.
    expect(scrub('Invalid phone 98200 11223')).toBe('Invalid phone [billing_phone]');
  });

  it('leaves a value shorter than ECHO_MIN_LENGTH alone', () => {
    // The paired control. Below three characters a replacement redacts the
    // sentence into unreadability and no field that short identifies anybody —
    // which is why `12` survives out of `12 Turner Road`: a house number with
    // no street is not an address.
    const echoes = payloadEchoes({ billing_address_2: 'A2' });

    expect(ECHO_MIN_LENGTH).toBe(3);
    expect(scrub('Flat A2 is not deliverable', echoes)).toBe('Flat A2 is not deliverable');
  });
});

// ============================================================================
// Pass 2 — any WORD of any value, for a quote-back that mangled it
// ============================================================================

describe('the word backstop', () => {
  it('catches a value quoted back in PART', () => {
    // A truncation, an HTML-escaped fragment, a validator that prints one word
    // of a name. No whole-value replace can reach these.
    expect(scrub('Consignee Ananya is not deliverable')).toBe(
      'Consignee [billing_customer_name] is not deliverable'
    );
  });

  it('over-masks, and that is the direction it is meant to over-shoot in', () => {
    // A customer living on `New Road` masks the word `new` in their own
    // diagnostic. A masked word is a field name; an unmasked street is a
    // person's home.
    const echoes = payloadEchoes({ billing_address: 'New Road' });

    expect(scrub('New request rejected', echoes)).toBe('[billing_address] request rejected');
  });

  it('does not eat the placeholders an earlier pass wrote', () => {
    // The failure this control exists for: a consignee living on `Address
    // Point` puts the word `address` into the vocabulary, and the word pass
    // then rewrites the inside of `[billing_address]` — destroying the one
    // thing the placeholder was there to say.
    const echoes = payloadEchoes({ billing_address: 'Address Point' });

    expect(scrub('Address Point is not deliverable', echoes)).toBe(
      '[billing_address] is not deliverable'
    );
  });

  it('attributes a shared word to the field that went out first', () => {
    // First field wins, so a word shared between two fields is stable rather
    // than flickering between them from one refusal to the next.
    const echoes = payloadEchoes({ billing_city: 'Bandra', billing_address_2: 'Bandra West' });

    expect(scrub('Bandra is not serviceable', echoes)).toBe('[billing_city] is not serviceable');
  });
});

// ============================================================================
// Pass 3 — shape, for the body we did not send at all
// ============================================================================

describe('the shape net', () => {
  /** `courier/assign/awb` sends a shipment id and nothing else. */
  const NO_ECHOES: EchoedField[] = [];

  it('masks an email, a phone and a pincode with no echo list at all', () => {
    // This is the whole defence on the AWB endpoint, which quotes back a
    // pincode we never handed it. Without this pass that endpoint's log line
    // is a customer's contact details.
    const said = scrub(
      'No courier for 400 050, contact ananya@example.test or 98200 11223',
      NO_ECHOES
    );

    expect(said).toContain('[pincode]');
    expect(said).toContain('[email]');
    expect(said).toContain('[phone]');
    expect(said).not.toContain('ananya@example.test');
    expect(said).not.toContain('11223');
  });

  it.each([
    ['plain', '9820011223'],
    ['spaced', '98200 11223'],
    ['dashed', '98200-11223'],
    ['country code, spaced', '+91 98200 11223'],
    ['country code, run together', '919820011223'],
    ['country code with a plus, run together', '+919820011223'],
    ['domestic dialling form', '09820011223'],
  ])('masks a mobile written %s', (_form, written) => {
    // The unseparated country code is the one that got through. The lookbehind
    // that stops `[phone]` matching inside a longer number is exactly what let
    // `919820011223` past: the ten-digit value sits inside a twelve-digit run.
    // The `+91 ` form was already masked, so the gap was specifically the form
    // a validator normalises TO.
    expect(scrub(`Invalid phone ${written} for consignee`, NO_ECHOES)).toBe(
      'Invalid phone [phone] for consignee'
    );
  });

  it('does not mask a number that is not a phone', () => {
    // The paired control. A shipment id and a rupee amount are ours to log,
    // and a net that caught them would leave an operator with a line of
    // placeholders instead of a diagnostic.
    expect(scrub('Shipment 912345678 was refused, rate 153', NO_ECHOES)).toBe(
      'Shipment 912345678 was refused, rate 153'
    );
  });

  it('does not stitch a phone out of separate numbers in a sentence', () => {
    // The separator class is closed and bounded, so a pattern built from it
    // cannot wander across words.
    expect(scrub('9 apples 8 pears 2 plums 0 figs', NO_ECHOES)).toBe(
      '9 apples 8 pears 2 plums 0 figs'
    );
  });
});

// ============================================================================
// The residue pass, and the fail-closed behind it
// ============================================================================

describe('nothing we sent survives, and when it would, nothing is returned', () => {
  it('repairs a value split by a separator run longer than the passes tolerate', () => {
    // A validator that pads or aligns its output. Pass 1's separator class is
    // bounded at two characters — deliberately, so a pattern of ten literal
    // digits cannot be made to wander — pass 2 has no word for a digit run,
    // and the shape net wants a bounded run too. The residue pass is the only
    // one that sees this, and it only ever fires on a value already found to
    // have survived.
    const answer = scrubEchoedValues('Invalid phone 98200      11223 for consignee', ECHOES);

    expect(answer.text).toBe('Invalid phone [billing_phone] for consignee');
    expect(answer.withheld, 'a repaired value is not a withheld one').toEqual([]);
  });

  it('withholds the sentence when a value straddles a placeholder', () => {
    // The case the repair cannot reach, and the reason the check runs a second
    // time rather than trusting the repair. `98200` and `11223` end up in
    // different segments — the word pass replaced the name between them — so
    // no single pattern can cover the run, and the only honest answer is to
    // log nothing of their sentence.
    const answer = scrubEchoedValues('phone 98200 Ananya 11223', ECHOES);

    expect(answer.withheld, 'the leak was not detected').toEqual(['billing_phone']);
    expect(answer.text, "the customer's mobile was logged").not.toContain('11223');
    // The notice names the fields and never their values: the field name is
    // what an operator needs, and it is not the customer's data.
    expect(answer.text).toContain('billing_phone');
    expect(answer.text).toContain('withheld');
  });

  it('the control: an ordinary refusal is scrubbed, not withheld', () => {
    // A fail-closed that fires on everything is a scrubber that logs nothing,
    // which is the failure this module exists to avoid rather than the one it
    // exists to cause.
    const answer = scrubEchoedValues('Invalid phone for Ananya Iyer at 12 Turner Road', ECHOES);

    expect(answer.withheld).toEqual([]);
    expect(answer.text).toContain('Invalid phone for');
  });
});

// ============================================================================
// The detector itself, proved able to fail
// ============================================================================

describe('survivingEchoes', () => {
  const echo = (field: string, value: string): EchoedField => ({ field, value });

  it('finds a value however it has been re-punctuated', () => {
    // It compares on the characters that identify — letters and digits, case
    // folded — because every separator between them is something a formatter
    // may have inserted or removed.
    expect(survivingEchoes('phone 98200-11223 refused', [echo('billing_phone', '9820011223')])).toEqual(
      ['billing_phone']
    );
  });

  it('reports the FIELD, never the value', () => {
    // This list is logged. A detector that answered with what it found would
    // put the customer's data in the line the withholding exists to keep clean.
    const found = survivingEchoes('at 12 Turner Road', [echo('billing_address', '12 Turner Road')]);

    expect(found).toEqual(['billing_address']);
    expect(JSON.stringify(found)).not.toContain('Turner');
  });

  it('the control: it clears a sentence that carries none of them', () => {
    expect(
      survivingEchoes('[billing_address] is not deliverable', [
        echo('billing_address', '12 Turner Road'),
        echo('billing_customer_name', 'Ananya Iyer'),
      ])
    ).toEqual([]);
  });

  it('does not read a value out of the placeholders themselves', () => {
    // Normalising strips the brackets and underscores, so `[billing_address]`
    // becomes `billingaddress` — and a value like `Address` would be found
    // inside a field NAME rather than inside their sentence. The check ignores
    // what is inside a placeholder, which is also the only region the repair
    // is allowed to rewrite.
    expect(
      survivingEchoes('[billing_address] is not deliverable', [echo('billing_address_2', 'Address')])
    ).toEqual([]);
  });

  it('ignores a value too short to be a leak rather than a coincidence', () => {
    // Below `RESIDUE_MIN_LENGTH` a normalised substring hit says more about
    // words running together than about a customer: passes 1 and 2 both key on
    // whole words and cover a short value well, and firing here would withhold
    // ordinary diagnostics for nothing.
    expect(RESIDUE_MIN_LENGTH).toBe(6);
    expect(survivingEchoes('the west gate', [echo('billing_address_2', 'West')])).toEqual([]);
    expect(survivingEchoes('the bandra gate', [echo('billing_city', 'Bandra')])).toEqual([
      'billing_city',
    ]);
  });
});

// ============================================================================
// The property, over every value in a real payload
// ============================================================================

describe('the whole payload, through every mangling we have seen', () => {
  /**
   * The mutations a validator has been observed to apply when quoting a value
   * back, plus the ones the passes are written to survive.
   *
   * Driven as a table rather than as prose, so a new mutation is one line and
   * a pass that stops covering one of them fails by name.
   */
  const MANGLINGS: ReadonlyArray<{ how: string; apply: (value: string) => string }> = [
    { how: 'verbatim', apply: (value) => value },
    { how: 'upper-cased', apply: (value) => value.toUpperCase() },
    { how: 'whitespace collapsed', apply: (value) => value.replace(/\s+/g, ' ') },
    { how: 'whitespace doubled', apply: (value) => value.replace(/ /g, '  ') },
    { how: 'padded mid-run', apply: (value) => `${value.slice(0, 5)}      ${value.slice(5)}` },
    { how: 'comma-separated', apply: (value) => value.split('').join(',').replace(/,,/g, ',') },
  ];

  const meaningful = ECHOES.filter((entry) => entry.value.trim().length >= ECHO_MIN_LENGTH);

  it('has values to check — the table is not empty', () => {
    // Without this the loop below passes with `payloadEchoes` returning [].
    expect(meaningful.length).toBeGreaterThan(5);
  });

  for (const { how, apply } of MANGLINGS) {
    it(`leaves no value in a sentence that quotes it ${how}`, () => {
      for (const entry of meaningful) {
        const quoted = apply(entry.value);
        const answer = scrubEchoedValues(`Shiprocket rejected ${quoted} on this order`, ECHOES);

        // Either the value was replaced, or the line was withheld. Both are
        // the property; only one of them is also diagnostic.
        expect(
          survivingEchoes(answer.text, ECHOES),
          `${entry.field} survived being quoted ${how}`
        ).toEqual([]);
      }
    });
  }
});

// ============================================================================
// The module account — nothing crosses this boundary unexamined
// ============================================================================

describe('the payload-echo-scrub module contract', () => {
  const SOURCE = resolve(__dirname, '../../src/lib/payload-echo-scrub.ts');

  /** The two functions a caller uses, in the order a caller uses them. */
  const entryPoints = ['payloadEchoes', 'scrubEchoedValues'] as const;

  /** The check behind the claim, exported so this file can drive it directly. */
  const detector = ['survivingEchoes'] as const;

  /** Bounds a reader has to be able to see, and a test has to be able to pin. */
  const constants = ['ECHO_MIN_LENGTH', 'RESIDUE_MIN_LENGTH'] as const;

  /**
   * The names no vocabulary above accounts for.
   *
   * Bound to the REAL export list rather than to a literal beside it, which is
   * the mistake `tests/lib/vendor-scope.test.ts:129-147` records having made:
   * a guard that filtered a literal passed with the module deleted.
   */
  const unaccounted = (names: readonly string[]): string[] =>
    names.filter(
      (name) =>
        !(entryPoints as readonly string[]).includes(name) &&
        !(detector as readonly string[]).includes(name) &&
        !(constants as readonly string[]).includes(name)
    );

  it('exports every name the vocabularies claim', () => {
    for (const name of [...entryPoints, ...detector]) {
      expect(typeof (scrubber as Record<string, unknown>)[name], `${name} missing`).toBe(
        'function'
      );
    }
    for (const name of constants) {
      expect((scrubber as Record<string, unknown>)[name], `${name} missing`).toBeDefined();
    }
  });

  it('exposes nothing this suite has not examined', () => {
    // A regex helper or a second entry point arriving here without a test is
    // exactly how the subsystem became untestable inside the carrier client.
    expect(unaccounted(Object.keys(scrubber))).toEqual([]);
  });

  it('the account is not vacuous — an unenrolled export would show up', () => {
    expect(Object.keys(scrubber), 'the module exported nothing').toContain('scrubEchoedValues');
    expect(unaccounted([...Object.keys(scrubber), 'redactEverythingSomeday'])).toEqual([
      'redactEverythingSomeday',
    ]);
  });

  /**
   * Pure: a file's contents in, its import statements out.
   *
   * Comments are stripped first, so the header — which has to name
   * `services/shiprocket.ts` and `lib/vendor-scope.ts` to explain where this
   * came from and why it is punctuated the way it is — is judged as prose.
   */
  function importStatements(contents: string): string[] {
    return contents
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .filter((line) => /^\s*import\b/.test(line) || /\brequire\(/.test(line));
  }

  it('imports nothing at all, so it cannot grow a second responsibility', () => {
    // The property that keeps this callable from any test with no fixture, no
    // network and no database — and the reason it could be lifted out of the
    // carrier client in the first place. A logger import here would be the
    // first step back: this module would start deciding what to log rather
    // than what is safe to log, and the two are not the same job.
    expect(importStatements(readFileSync(SOURCE, 'utf8'))).toEqual([]);
  });

  it('CAN fail: the same reader catches a planted import', () => {
    expect(
      importStatements("import { logger } from './logger';\nconst x = require('pg');\n")
    ).toHaveLength(2);
    // ...and clears prose that merely mentions one, so it is a check and not a
    // blanket refusal.
    expect(importStatements('// import { logger } from "./logger"\nconst x = 1;\n')).toEqual([]);
  });
});
