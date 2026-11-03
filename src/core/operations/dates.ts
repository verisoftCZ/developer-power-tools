type Parts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
};
function utc(parts: Parts): number {
  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  date.setUTCHours(parts.hour, parts.minute, parts.second, parts.millisecond);
  if (
    parts.year < 1 ||
    parts.year > 9999 ||
    date.getUTCFullYear() !== parts.year ||
    date.getUTCMonth() + 1 !== parts.month ||
    date.getUTCDate() !== parts.day ||
    date.getUTCHours() !== parts.hour ||
    date.getUTCMinutes() !== parts.minute ||
    date.getUTCSeconds() !== parts.second ||
    date.getUTCMilliseconds() !== parts.millisecond
  )
    throw new Error('Invalid calendar date or time.');
  return date.getTime();
}
function formatter(zone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat('en-GB-u-ca-iso8601-nu-latn', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    throw new Error(`Invalid timezone: ${zone}. Use UTC or an IANA zone such as Europe/Prague.`);
  }
}
function atZone(instant: number, format: Intl.DateTimeFormat): Parts {
  const p = Object.fromEntries(
    format.formatToParts(new Date(instant)).map((p) => [p.type, p.value]),
  );
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
    millisecond: ((instant % 1000) + 1000) % 1000,
  };
}
function inZone(parts: Parts, zone: string, ambiguity: unknown): number {
  const wall = utc(parts);
  const format = formatter(zone);
  if (zone === 'UTC') return wall;
  const offsets = new Set<number>();
  // Sample both sides of transitions, then validate every candidate against the requested wall time.
  for (let hours = -48; hours <= 48; hours += 6) {
    const sample = wall + hours * 3600000;
    offsets.add(utc(atZone(sample, format)) - sample);
  }
  const candidates = [...offsets]
    .map((offset) => wall - offset)
    .filter((candidate) => utc(atZone(candidate, format)) === wall)
    .sort((a, b) => a - b);
  if (!candidates.length)
    throw new Error(
      'This local time does not exist in the source timezone (daylight-saving transition).',
    );
  if (candidates.length > 1 && ambiguity === 'reject')
    throw new Error(
      'This local time is ambiguous in the source timezone. Choose earlier or later, or include an explicit UTC offset.',
    );
  return ambiguity === 'later' ? candidates[candidates.length - 1] : candidates[0];
}
function parseCustom(source: string, format: string): Parts {
  const tokens: Record<string, keyof Parts> = {
    yyyy: 'year',
    MM: 'month',
    dd: 'day',
    HH: 'hour',
    mm: 'minute',
    ss: 'second',
    SSS: 'millisecond',
  };
  const seen = new Set<string>();
  const fields: (keyof Parts)[] = [];
  let pattern = '^';
  for (let i = 0; i < format.length;) {
    const token = Object.keys(tokens).find((token) => format.startsWith(token, i));
    if (token) {
      if (seen.has(token)) throw new Error('Duplicate token in custom date format.');
      seen.add(token);
      fields.push(tokens[token]);
      pattern += `(\\d{${token.length}})`;
      i += token.length;
    } else {
      const c = format[i++];
      if (/[A-Za-z]/.test(c) && c !== 'T')
        throw new Error(
          'Custom formats support yyyy MM dd HH mm ss SSS, literal T, spaces and punctuation.',
        );
      pattern += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  if (!seen.has('yyyy') || !seen.has('MM') || !seen.has('dd'))
    throw new Error('Custom format must include yyyy, MM and dd.');
  const match = new RegExp(pattern + '$').exec(source);
  if (!match) throw new Error('Date does not match the custom format.');
  const parts: Parts = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0, millisecond: 0 };
  fields.forEach((key, i) => (parts[key] = Number(match[i + 1])));
  return parts;
}
function parseDate(
  source: string,
  format: string,
  custom: string,
  sourceZone: string,
  ambiguity: unknown,
): number {
  if (format === 'auto' && /^-?\d{10}$/.test(source)) format = 'unix seconds';
  else if (format === 'auto' && /^-?\d{13}$/.test(source)) format = 'unix milliseconds';
  if (format === 'unix seconds' || format === 'unix milliseconds') {
    if (!/^-?\d+(?:\.\d+)?$/.test(source)) throw new Error('Expected a numeric Unix timestamp.');
    const instant = Number(source) * (format === 'unix seconds' ? 1000 : 1);
    if (!Number.isFinite(instant) || Math.abs(instant) > 8640000000000000)
      throw new Error('Timestamp is outside the supported date range.');
    return Math.trunc(instant);
  }
  if (format === 'custom') return inZone(parseCustom(source, custom), sourceZone, ambiguity);
  const iso =
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:?\d{2})?)?$/i;
  if (
    format === 'ISO 8601' ||
    format === 'yyyy-MM-dd' ||
    (format === 'auto' && /^\d{4}-/.test(source))
  ) {
    const m = iso.exec(source);
    if (!m || (format === 'yyyy-MM-dd' && source.length !== 10))
      throw new Error('Expected ISO date/time, e.g. 2025-08-19T14:30:00+02:00.');
    const parts: Parts = {
      year: +m[1],
      month: +m[2],
      day: +m[3],
      hour: +(m[4] ?? 0),
      minute: +(m[5] ?? 0),
      second: +(m[6] ?? 0),
      millisecond: Number((m[7] ?? '').padEnd(3, '0')),
    };
    const wall = utc(parts);
    if (!m[8]) return inZone(parts, sourceZone, ambiguity);
    if (m[8].toUpperCase() === 'Z') return wall;
    const offset = m[8].slice(1).replace(':', '');
    const hours = +offset.slice(0, 2),
      minutes = +offset.slice(2);
    if (hours > 23 || minutes > 59) throw new Error('Invalid UTC offset.');
    return wall - (m[8][0] === '-' ? -1 : 1) * (hours * 60 + minutes) * 60000;
  }
  const m =
    /^(\d{2})([./])(\d{2})\2(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/.exec(
      source,
    );
  if (!m) throw new Error('Unrecognized date. Choose an input format or supply a custom format.');
  const first = +m[1],
    second = +m[3];
  if (format === 'auto') {
    if (m[2] === '.') format = 'dd.MM.yyyy';
    else if (first > 12) format = 'dd/MM/yyyy';
    else if (second > 12) format = 'MM/dd/yyyy';
    else throw new Error('Ambiguous slash date. Specify dd/MM/yyyy or MM/dd/yyyy.');
  }
  if (
    !['dd.MM.yyyy', 'dd/MM/yyyy', 'MM/dd/yyyy'].includes(format) ||
    (format === 'dd.MM.yyyy') !== (m[2] === '.')
  )
    throw new Error('Date does not match the selected input format.');
  return inZone(
    {
      year: +m[4],
      month: format === 'MM/dd/yyyy' ? first : second,
      day: format === 'MM/dd/yyyy' ? second : first,
      hour: +(m[5] ?? 0),
      minute: +(m[6] ?? 0),
      second: +(m[7] ?? 0),
      millisecond: Number((m[8] ?? '').padEnd(3, '0')),
    },
    sourceZone,
    ambiguity,
  );
}
export function convertDate(source: string, p: Record<string, unknown>): string {
  const sourceZone = String(p.sourceZone),
    outputZone = String(p.outputZone);
  formatter(sourceZone);
  const output = formatter(outputZone);
  const instant = parseDate(
    source.trim(),
    String(p.format),
    String(p.customFormat),
    sourceZone,
    p.ambiguity,
  );
  const date = new Date(instant);
  if (date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999)
    throw new Error('Date is outside the supported years 0001–9999.');
  const local = atZone(instant, output);
  const offset = (utc(local) - instant) / 60000;
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  if (p.outputFormat === 'Czech')
    return `${pad(local.day)}.${pad(local.month)}.${pad(local.year, 4)} ${pad(local.hour)}:${pad(local.minute)}:${pad(local.second)}${local.millisecond ? '.' + pad(local.millisecond, 3) : ''}`;
  if (outputZone === 'UTC') return date.toISOString();
  const sign = offset < 0 ? '-' : '+';
  const absolute = Math.abs(offset);
  return `${pad(local.year, 4)}-${pad(local.month)}-${pad(local.day)}T${pad(local.hour)}:${pad(local.minute)}:${pad(local.second)}.${pad(local.millisecond, 3)}${sign}${pad(Math.floor(absolute / 60))}:${pad(Math.floor(absolute % 60))}${absolute % 1 ? ':' + pad(Math.round((absolute % 1) * 60)) : ''}`;
}
