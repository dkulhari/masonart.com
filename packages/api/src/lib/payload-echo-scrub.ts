/**
 * Taking our own data back out of somebody else's sentence.
 *
 * When a third party refuses a write, its body quotes the payload back — and
 * the payload we send a courier is a customer's name, street, phone and email.
 * That body is diagnostic and has to reach an operator, and it is a PII
 * carrier and must not reach a log aggregator. This module is the whole of the
 * reconciliation: their sentence with the values WE sent replaced by the NAME
 * of the field each one left in.
 *
 * ## Why it is a module and not a function inside the carrier client
 *
 * It was one, and being one was the problem. Three passes of regular
 * expressions with lookbehinds, a per-word backstop map and placeholder-aware
 * rewriting is the most delicate code on the dispatch path, it decides whether
 * a customer's home address is written into an aggregator permanently, and
 * inside `services/shiprocket.ts` it was reachable only through two calls that
 * write to a real courier. A behavioural test through those calls can assert
 * that ONE fixture's values did not appear; it cannot show which pass caught
 * them, cannot show a pass is load-bearing, and cannot exercise a shape the
 * fixture happens not to contain. Out here every pass is a function a test
 * calls directly, with a planted input it must catch and a paired input it
 * must leave alone — `tests/lib/payload-echo-scrub.test.ts`.
 *
 * It also is not a carrier's concern. Nothing below knows what a waybill is.
 *
 * ## The claim, and the half of it that is checked
 *
 * *No value we put on the wire survives, and where that cannot be shown,
 * nothing of their sentence is returned at all.*
 *
 * The first half is **three heuristics and is not a proof** — an earlier
 * version of this comment called the first pass a proof and it was an exact
 * substring replace, which any normalisation on the far side defeated. Calling
 * a heuristic a proof is what stops the next reader adding the belt and
 * braces. The second half is `survivingEchoes`, which re-reads the finished
 * text looking for the characters of any value we sent; what it finds is
 * repaired if a single pattern can cover it, and if it cannot, the sentence is
 * dropped and the caller is told which FIELD caused that. So the claim is
 * true by construction rather than by argument, and the cost of it being
 * conservative is a diagnostic, not a person.
 *
 * ## The passes, in order
 *
 * 1. **The whole value**, whitespace-tolerant and case-insensitive, longest
 *    first so a street replaces before the city inside it. `Invalid phone for
 *    Ananya Iyer at 12 Turner Road` becomes `Invalid phone for
 *    [billing_customer_name] at [billing_address]` — more diagnostic than the
 *    original, and carrying no person.
 * 2. **Any WORD of any value we sent**, which catches a quote-back that
 *    truncated, re-punctuated or HTML-escaped the value. It over-masks: a
 *    customer on `New Road` masks the word `new` in their own diagnostic. That
 *    is the safe direction — a masked word is a field name, an unmasked street
 *    is a person's home.
 * 3. **Shape**, for a body we did not send at all. `courier/assign/awb` posts
 *    a shipment id and nothing else and still quotes back a pincode, so on
 *    that endpoint there is no list to compare against and shape is the only
 *    thing left.
 * 4. **The residue pass**, which runs only on a value pass 1–3 provably left
 *    behind, and tolerates any run of separators between the value's
 *    characters. It is last because it is the loosest, and it is guarded by
 *    the detector so it never fires speculatively.
 *
 * ## Style
 *
 * Single quotes with semicolons, which is `services/shiprocket.ts`'s
 * punctuation rather than the no-semicolon style of `lib/vendor-scope.ts` and
 * `lib/production-readiness.ts`. Deliberate: this is that file's code, moved,
 * and keeping its punctuation is what makes the move readable as a move.
 *
 * @see packages/api/tests/lib/payload-echo-scrub.test.ts
 * @see packages/api/src/services/shiprocket.ts
 */

// ============================================================================
// What a caller hands in, and the two-part answer it gets back
// ============================================================================

/** One value we put on the wire, and the field it went out in. */
export interface EchoedField {
  field: string;
  value: string;
}

/**
 * The answer, in two parts, because they need different handling.
 *
 * A caller logs `text` and nothing else. `withheld` is empty on every ordinary
 * refusal; when it is not, `text` carries no part of their sentence and the
 * field names in it are the only thing left to go on. Returning one string
 * would make those two states indistinguishable to a reader of the log, which
 * is exactly the distinction that says whether the diagnostic is missing
 * because they said nothing or because we could not safely repeat it.
 */
export interface ScrubbedMessage {
  /** Safe to log: their sentence with our data replaced, or the withheld notice. */
  text: string;
  /** Field NAMES whose values survived every pass. Never their values. */
  withheld: string[];
}

// ============================================================================
// Two lengths, deliberately different — see each one for which way it errs
// ============================================================================

/**
 * The shortest value, and the shortest word, worth replacing.
 *
 * Below this the replacement is noise rather than protection: a one- or
 * two-character value redacts the sentence into unreadability, and no field
 * that short identifies anybody. It is the reason `12` survives out of
 * `12 Turner Road` — a house number with no street is not an address.
 */
export const ECHO_MIN_LENGTH = 3;

/**
 * The shortest value the DETECTOR will call a survivor.
 *
 * Longer than `ECHO_MIN_LENGTH`, and the asymmetry is the point. The detector
 * compares normalised text, which has had its separators removed, so a short
 * value can be found inside two ordinary words that happen to run together —
 * and a false positive there does not over-mask a word, it withholds the whole
 * sentence. Six characters is a phone, a pincode, an email or a street; below
 * that, passes 1 and 2 both key on whole words and cover a short value well.
 */
export const RESIDUE_MIN_LENGTH = 6;

/**
 * What is logged instead of their sentence when a value survived every pass.
 *
 * It names the FIELDS and never their values: the field name is what an
 * operator needs in order to go and look at the right thing, and it is not the
 * customer's data.
 *
 * That matters more than it looks. The refusals a caller throws on this path
 * say *the reason is in the API logs*, and a withheld line has to keep that
 * sentence true in a reduced form — which it does, because what a validation
 * complaint is ABOUT is the field it names, and that is exactly the half of it
 * that survives here. A bare "[redacted]" would make the promise false.
 */
function withheldNotice(fields: readonly string[]): string {
  return `[withheld: this answer quoted ${fields.join(', ')} back in a form this scrubber could not safely replace]`;
}

// ============================================================================
// The vocabulary: derived from the payload that was sent, never a kept list
// ============================================================================

/**
 * Every string this process put on the wire, tagged with the field it left in.
 *
 * **Derived by walking the payload OBJECT that was actually sent**, which is
 * the whole point of this function existing. It replaced a hand-kept second
 * enumeration of the consignee that was documented as "derived from the
 * payload rather than listed a second time" and was not: nothing bound the two
 * lists, so a field added to the payload and sent to the courier lost its
 * scrubbing silently, with the compiler quiet and every test green.
 *
 * Strings only, and numbers deliberately not. Every number in a courier
 * payload is a dimension or an amount of money; none of them identifies a
 * person, and masking short numeric runs turns a diagnostic sentence into
 * placeholders. The numbers that DO identify — a pincode, a phone — are
 * strings in that payload because they are strings in the schema.
 *
 * Nested strings are attributed to the TOP-LEVEL key they sit under, so an
 * item name quoted back reads `[order_items]`. Naming the leaf would need a
 * path, and the field name is here to tell an operator where to look, not to
 * reconstruct what was said.
 */
export function payloadEchoes(payload: Record<string, unknown>): EchoedField[] {
  const echoes: EchoedField[] = [];

  const walk = (field: string, node: unknown): void => {
    if (typeof node === 'string') {
      echoes.push({ field, value: node });
      return;
    }
    if (Array.isArray(node)) {
      for (const entry of node) walk(field, entry);
      return;
    }
    if (typeof node === 'object' && node !== null) {
      for (const entry of Object.values(node as Record<string, unknown>)) walk(field, entry);
    }
  };

  for (const [field, value] of Object.entries(payload)) walk(field, value);
  return echoes;
}

// ============================================================================
// The passes themselves, in the order scrubEchoedValues applies them
// ============================================================================

/**
 * The punctuation a validator inserts, as a bounded gap between characters.
 *
 * Two characters at most — `, ` is two — and only from a closed class, so a
 * pattern built with it cannot wander across words: `98200 11223` and
 * `(982) 001-1223` both match `9820011223`, while `9 apples 8 pears` matches
 * nothing. Bounded rather than `*` because an unbounded gap between ten
 * literal digits is a pattern that can be made to backtrack.
 */
const RE_PUNCTUATION = '[\\s,.\\-/()]{0,2}';

/**
 * Anything that identifies a person by SHAPE, for the body we did not send.
 *
 * Separator-tolerant, and that is not a nicety: on `courier/assign/awb` the
 * caller sends a shipment id and nothing else, so there is no echo list to
 * compare against and this is the SOLE defence — while that endpoint is
 * precisely the one that quotes back a pincode and a phone number we never
 * handed it. A formatted `98200 11223` there has nothing else standing behind
 * it.
 */
const PERSONAL_SHAPES: ReadonlyArray<{ pattern: RegExp; as: string }> = [
  { pattern: /[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+/g, as: '[email]' },
  // Indian mobile numbers, and long enough not to catch a shipment id. The
  // lookarounds do the job `\b` used to: they refuse to start or stop inside a
  // longer digit run, which `\b` cannot express once separators are allowed.
  //
  // The country code is OPTIONAL and inside the same run, because the
  // lookbehind that stops this matching inside a longer number is exactly what
  // let `919820011223` through: the ten-digit value sits inside a twelve-digit
  // run, so this shape found nothing, the whole-value pass found nothing (its
  // digit pattern carries the same lookbehind) and the word pass has one word
  // and it is the unprefixed number. The `+91 ` form WAS masked, so the gap
  // was specifically the form a validator normalises TO. `0` is here for the
  // domestic dialling form, for the same reason. The separator run sits INSIDE
  // the optional group, so an unprefixed number does not let the pattern eat
  // the space in front of it and log `Invalid phone[phone]`.
  {
    pattern: new RegExp(
      `(?<!\\d)(?:(?:\\+?91|0)${RE_PUNCTUATION})?[6-9](?:${RE_PUNCTUATION}\\d){9}(?!\\d)`,
      'g'
    ),
    as: '[phone]',
  },
  // A six-digit run, split or not — `400 050` is how a form prints one. Over-
  // masks the occasional amount in paise, which is the safe direction: a
  // masked number is a lookup, an unmasked address is not.
  {
    pattern: new RegExp(`(?<!\\d)\\d{3}${RE_PUNCTUATION}\\d{3}(?!\\d)`, 'g'),
    as: '[pincode]',
  },
];

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A value as a pattern that survives the punctuation a validator moves.
 *
 * Two measured failures, and they need different treatment:
 *
 * 1. **Whitespace COLLAPSED.** A consignee typed `12  Turner Road` into a
 *    form — nothing normalises it — so we sent the double space, the validator
 *    quoted it back as `12 Turner Road`, and an exact substring replace
 *    matched nothing. No shape matches a street name either, so the address
 *    reached the aggregator through the pass that is supposed to be strong.
 * 2. **Whitespace INSERTED, into a digit run.** `9820011223` came back as
 *    `98200 11223` — what a validator that formats numbers does — and all
 *    three passes missed it: this pattern tolerated collapsing and found
 *    nothing to collapse; the word pass keys on whole WORDS of the value and
 *    the value is ONE word, so `98200` is not a key in its map; the shape net
 *    wanted ten contiguous digits.
 *
 * So a value that is one unbroken run of digits gets a per-DIGIT pattern, and
 * everything else keeps the per-token one. The asymmetry is the point rather
 * than an omission: re-punctuating the middle of a WORD is not something a
 * validator does, and a text value's words are keys in the word pass anyway —
 * which is exactly what a digit run's fragments are not.
 */
function echoPattern(value: string): RegExp {
  const trimmed = value.trim();

  if (/^\d+$/.test(trimmed)) {
    return new RegExp(`(?<!\\d)${trimmed.split('').join(RE_PUNCTUATION)}(?!\\d)`, 'g');
  }

  return new RegExp(trimmed.split(/\s+/).map(escapeForRegExp).join('\\s+'), 'gi');
}

/**
 * Every WORD of every value we sent, mapped to the field it came from.
 *
 * The backstop for the case no whole-value replace can reach: a refusal that
 * quotes a value in PART — `Consignee Ananya is not deliverable`, a truncation,
 * an HTML-escaped fragment. First field wins, so a word shared between two
 * fields is attributed to the one that went out first rather than flickering.
 */
function echoWords(echoes: readonly EchoedField[]): Map<string, string> {
  const words = new Map<string, string>();
  for (const echo of echoes) {
    for (const word of echo.value.split(/[^\p{L}\p{N}]+/u)) {
      if (word.length < ECHO_MIN_LENGTH) continue;
      const key = word.toLowerCase();
      if (!words.has(key)) words.set(key, echo.field);
    }
  }
  return words;
}

/** A placeholder this module has already written, so a later pass leaves it alone. */
const PLACEHOLDER = /\[[A-Za-z0-9_]+\]/g;

/**
 * Apply a rewrite to the parts of a sentence that are not already placeholders.
 *
 * Without this, the word pass eats its own output: a consignee living on
 * `Address Point` puts the word `address` into the vocabulary, and the pass
 * then rewrites the `billing_address` inside a placeholder the previous pass
 * wrote, destroying the one thing the placeholder was there to say.
 */
function outsidePlaceholders(text: string, rewrite: (segment: string) => string): string {
  let out = '';
  let last = 0;
  for (const match of text.matchAll(PLACEHOLDER)) {
    out += rewrite(text.slice(last, match.index)) + match[0];
    last = match.index + match[0].length;
  }
  return out + rewrite(text.slice(last));
}

// ============================================================================
// The check at the end — the only part of the claim that is not a heuristic
// ============================================================================

/** A string reduced to the characters that identify. For comparison only. */
function normalise(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

/**
 * Which of our values are still in this text, by field name.
 *
 * The check behind the module's claim, and the reason the claim can be stated
 * at all. It compares NORMALISED text — letters and digits only, case folded —
 * because every separator between a value's characters is something the far
 * side may have inserted or removed, and a comparison that respected them
 * would be the exact-substring test that failed in the first place.
 *
 * It reports the FIELD and never the value: this list is logged, and a
 * detector that answered with what it found would put the customer's data into
 * the line that the withholding exists to keep clean.
 *
 * Placeholders are removed before the comparison. Normalising strips their
 * brackets and underscores, so `[billing_address]` becomes `billingaddress`,
 * and a value like `Address` would otherwise be "found" inside a field NAME.
 * They are removed rather than replaced with a letter, which would also work
 * and would make the fail-closed below unreachable: a value whose characters
 * straddle a placeholder is a real leak and has to stay detectable.
 */
export function survivingEchoes(text: string, echoes: readonly EchoedField[]): string[] {
  const haystack = normalise(text.replace(PLACEHOLDER, ' '));
  const found: string[] = [];

  for (const echo of echoes) {
    const needle = normalise(echo.value);
    if (needle.length < RESIDUE_MIN_LENGTH) continue;
    if (haystack.includes(needle) && !found.includes(echo.field)) found.push(echo.field);
  }

  return found;
}

/**
 * A value as a pattern that tolerates ANY run of separators between its
 * characters.
 *
 * The loosest pattern in the file, and it only ever runs against a value
 * `survivingEchoes` has already found in the text — never speculatively, which
 * is what keeps `RE_PUNCTUATION`'s bound meaningful for the passes that do run
 * on every value.
 *
 * It cannot backtrack catastrophically: the separator class is the complement
 * of the literal class, so at every position exactly one of the two can match
 * and there is no ambiguity for a backtracker to explore.
 *
 * It always matches when the detector fires, and that is the same fact stated
 * twice: `survivingEchoes` finds the value's characters consecutive in the
 * normalised text, which means the only things between them in the original
 * are non-alphanumerics — which is precisely what this pattern spans. The one
 * exception is a run that straddles a placeholder, because the rewrite is only
 * allowed outside them, and that is the case the fail-closed exists for.
 */
function residuePattern(value: string): RegExp {
  const characters = [...value].filter((character) => /[\p{L}\p{N}]/u.test(character));
  return new RegExp(characters.map(escapeForRegExp).join('[^\\p{L}\\p{N}]*'), 'giu');
}

// ============================================================================
// The entry point: every pass, then the check, then withhold or answer
// ============================================================================

/**
 * Their sentence, with the customer taken out of it.
 *
 * The four passes are described in the module header; what is here is the
 * order and the fail-closed at the end.
 *
 * What no pass can reach, named rather than hidden: a value the far side
 * PARAPHRASES rather than quotes, and a fragment shorter than
 * `ECHO_MIN_LENGTH`. A paraphrase is not detectable by any of this — nothing
 * of the value is present to find — and a short fragment is one the detector
 * deliberately ignores, because at that length a normalised hit says more
 * about two words running together than about a customer.
 *
 * Runs of the same placeholder collapse at the end, so a three-word address
 * caught word by word reads `[billing_address]` and not `[billing_address]
 * [billing_address] [billing_address]`.
 */
export function scrubEchoedValues(
  message: string,
  echoes: readonly EchoedField[]
): ScrubbedMessage {
  let scrubbed = message;

  // 1. The whole value, longest first.
  for (const echo of [...echoes].sort((a, b) => b.value.length - a.value.length)) {
    if (echo.value.trim().length < ECHO_MIN_LENGTH) continue;
    scrubbed = outsidePlaceholders(scrubbed, (segment) =>
      segment.replace(echoPattern(echo.value), `[${echo.field}]`)
    );
  }

  // 2. Any word of any value.
  const words = echoWords(echoes);
  if (words.size > 0) {
    scrubbed = outsidePlaceholders(scrubbed, (segment) =>
      segment.replace(/[\p{L}\p{N}]+/gu, (word) => {
        const field = words.get(word.toLowerCase());
        return field === undefined ? word : `[${field}]`;
      })
    );
  }

  // 3. Shape, for what we never sent.
  for (const shape of PERSONAL_SHAPES) {
    scrubbed = outsidePlaceholders(scrubbed, (segment) => segment.replace(shape.pattern, shape.as));
  }

  // 4. The residue pass, on exactly the values shown to have survived.
  for (const field of survivingEchoes(scrubbed, echoes)) {
    for (const echo of echoes) {
      if (echo.field !== field) continue;
      scrubbed = outsidePlaceholders(scrubbed, (segment) =>
        segment.replace(residuePattern(echo.value), `[${echo.field}]`)
      );
    }
  }

  scrubbed = scrubbed.replace(/(\[[A-Za-z0-9_]+\])(?:[\s,.\-/]*\1)+/g, '$1');

  // The claim, checked rather than argued. Anything still standing here is a
  // value the repair could not cover in one pattern — a run straddling a
  // placeholder — and the only honest answer is to log none of their sentence.
  const withheld = survivingEchoes(scrubbed, echoes);
  return withheld.length === 0
    ? { text: scrubbed, withheld }
    : { text: withheldNotice(withheld), withheld };
}
