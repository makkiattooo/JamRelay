export type PlaylistFormat = 'json' | 'csv' | 'm3u8' | 'txt';
export type ImportedTrack = {
  position: number;
  track_id?: number | null;
  title: string;
  artist: string;
  album?: string | null;
  duration_ms?: number | null;
  uri?: string | null;
  provider_mappings?: Array<{
    provider_id: string;
    connection_id?: string | null;
    provider_track_id: string;
    provider_uri?: string | null;
  }>;
};
export type PlaylistDocument = {
  version: 1;
  format: 'jamrelay-playlist';
  name?: string;
  description?: string;
  tracks: ImportedTrack[];
};
export type ImportReport = {
  ok: boolean;
  format: PlaylistFormat;
  document: PlaylistDocument | null;
  unresolved: Array<{ position: number; reason: string }>;
  errors: Array<{ code: string; message: string; position?: number }>;
  truncated?: boolean;
};

export const MAX_IMPORT_BYTES = 1024 * 1024;
export const MAX_IMPORT_TRACKS = 10000;
const MAX_ERRORS = 50;
const error = (code: string, message: string, position?: number) => ({
  code,
  message,
  ...(position === undefined ? {} : { position }),
});
const text = (value: unknown) => (value == null ? '' : String(value).trim());
function bounded(source: string) {
  if (new TextEncoder().encode(source).byteLength > MAX_IMPORT_BYTES)
    return error('input_too_large', `Import input exceeds ${MAX_IMPORT_BYTES} bytes.`);
  return null;
}
function track(position: number, fields: any): ImportedTrack {
  const result: ImportedTrack = {
    position,
    title: text(fields.title),
    artist: text(fields.artist),
    album: text(fields.album) || null,
    uri: text(fields.uri) || null,
  };
  if (fields.track_id !== undefined && fields.track_id !== '')
    result.track_id = Number(fields.track_id);
  if (fields.duration_ms !== undefined && fields.duration_ms !== '')
    result.duration_ms = Number(fields.duration_ms);
  if (fields.provider_id && fields.provider_track_id)
    result.provider_mappings = [
      {
        provider_id: text(fields.provider_id),
        connection_id: text(fields.connection_id) || null,
        provider_track_id: text(fields.provider_track_id),
        provider_uri: text(fields.provider_uri) || null,
      },
    ];
  return result;
}
function validateTracks(
  tracks: ImportedTrack[],
  format: PlaylistFormat,
  baseErrors: any[] = [],
): ImportReport {
  const errors = baseErrors.slice(0, MAX_ERRORS),
    unresolved: Array<{ position: number; reason: string }> = [];
  if (tracks.length > MAX_IMPORT_TRACKS) {
    errors.push(error('too_many_tracks', `Import contains more than ${MAX_IMPORT_TRACKS} tracks.`));
    tracks = tracks.slice(0, MAX_IMPORT_TRACKS);
  }
  tracks.forEach((item, index) => {
    item.position = index;
    if (!item.title || !item.artist)
      errors.push(error('invalid_track', 'Track requires title and artist.', index));
    if (!item.track_id && !item.uri && !item.provider_mappings?.length)
      unresolved.push({ position: index, reason: 'no canonical ID or provider mapping' });
  });
  const document = { version: 1 as const, format: 'jamrelay-playlist' as const, tracks };
  return {
    ok: errors.length === 0,
    format,
    document,
    unresolved,
    errors: errors.slice(0, MAX_ERRORS),
    ...(errors.length > MAX_ERRORS ? { truncated: true } : {}),
  };
}
function parseCsv(source: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted && c === '"' && source[i + 1] === '"') {
      field += '"';
      i++;
      continue;
    }
    if (c === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && c === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (!quoted && (c === '\n' || c === '\r')) {
      if (c === '\r' && source[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
      field = '';
      continue;
    }
    field += c;
  }
  if (quoted) return { rows, parseError: true };
  if (field || row.length) {
    row.push(field);
    if (row.some((v) => v !== '')) rows.push(row);
  }
  return { rows, parseError: false };
}
function parseDelimited(source: string, delimiter: string) {
  return source
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => line.split(delimiter));
}
export function parsePlaylistImport(source: string, format: PlaylistFormat): ImportReport {
  const sizeError = bounded(source);
  if (sizeError) return { ok: false, format, document: null, unresolved: [], errors: [sizeError] };
  try {
    if (format === 'json') {
      const value = JSON.parse(source);
      if (!value || value.version !== 1 || !Array.isArray(value.tracks))
        return {
          ok: false,
          format,
          document: null,
          unresolved: [],
          errors: [error('invalid_json_schema', 'JSON must contain version 1 and a tracks array.')],
        };
      const tracks = value.tracks.map((x: any, i: number) => track(i, x));
      const report = validateTracks(tracks, format);
      if (report.document) {
        report.document.name = text(value.name) || undefined;
        report.document.description = text(value.description) || undefined;
      }
      return report;
    }
    if (format === 'csv') {
      const parsed = parseCsv(source);
      if (parsed.parseError)
        return {
          ok: false,
          format,
          document: null,
          unresolved: [],
          errors: [error('malformed_csv', 'CSV contains an unterminated quoted field.')],
        };
      if (!parsed.rows.length) return validateTracks([], format);
      const headers = parsed.rows[0].map((x) => text(x).toLowerCase());
      const required = ['title', 'artist'];
      const missing = required.filter((x) => !headers.includes(x));
      if (missing.length)
        return {
          ok: false,
          format,
          document: null,
          unresolved: [],
          errors: [error('invalid_csv_schema', `CSV is missing columns: ${missing.join(', ')}.`)],
        };
      return validateTracks(
        parsed.rows
          .slice(1)
          .map((row, i) => track(i, Object.fromEntries(headers.map((h, j) => [h, row[j] ?? ''])))),
        format,
      );
    }
    if (format === 'm3u8') {
      const lines = source.replace(/^\uFEFF/, '').split(/\r?\n/),
        tracks: ImportedTrack[] = [],
        errors: any[] = [];
      let pending: any = {};
      for (const line of lines) {
        if (!line.trim()) continue;
        if (line.startsWith('#EXTINF:')) {
          const match = line.match(/^#EXTINF:([^,]*),(.*)$/);
          if (!match) errors.push(error('malformed_m3u8', 'Malformed EXTINF line.'));
          else {
            pending.duration_ms = Number(match[1]) >= 0 ? Number(match[1]) * 1000 : undefined;
            const label = match[2].split(' - ');
            pending.artist = label.length > 1 ? label.shift() : '';
            pending.title = label.join(' - ');
          }
          continue;
        }
        if (line.startsWith('#')) continue;
        if (!pending.title) pending.title = line;
        pending.uri = line;
        tracks.push(track(tracks.length, pending));
        pending = {};
      }
      return validateTracks(tracks, format, errors);
    }
    const rows = parseDelimited(source, '\t');
    const header = rows[0]?.map(text);
    const hasHeader = header?.[0] === 'title' && header?.[1] === 'artist';
    const data = hasHeader ? rows.slice(1) : rows;
    return validateTracks(
      data.map((row, i) =>
        track(
          i,
          hasHeader
            ? Object.fromEntries(header!.map((h, j) => [h, row[j] ?? '']))
            : { title: row[0], artist: row[1], album: row[2], uri: row[3] },
        ),
      ),
      format,
    );
  } catch {
    return {
      ok: false,
      format,
      document: null,
      unresolved: [],
      errors: [error('malformed_input', 'Input could not be parsed safely.')],
    };
  }
}
const csv = (value: unknown) => {
  const x = value == null ? '' : String(value);
  return /[",\r\n]/.test(x) ? `"${x.replaceAll('"', '""')}"` : x;
};
export function exportPlaylist(document: PlaylistDocument, format: PlaylistFormat): string {
  if (format === 'json') return JSON.stringify(document, null, 2);
  if (format === 'csv')
    return (
      [
        'position,title,artist,album,uri,track_id,provider_id,connection_id,provider_track_id,provider_uri',
        ...document.tracks.map((t) => {
          const m = t.provider_mappings?.[0];
          return [
            t.position,
            t.title,
            t.artist,
            t.album,
            t.uri,
            t.track_id,
            m?.provider_id,
            m?.connection_id,
            m?.provider_track_id,
            m?.provider_uri,
          ]
            .map(csv)
            .join(',');
        }),
      ].join('\n') + '\n'
    );
  if (format === 'm3u8')
    return (
      [
        '#EXTM3U',
        ...document.tracks.flatMap((t) => [
          `#EXTINF:${t.duration_ms == null ? -1 : Math.round(t.duration_ms / 1000)},${t.artist} - ${t.title}`,
          t.uri ?? '',
        ]),
      ].join('\n') + '\n'
    );
  return (
    [
      'title\tartist\talbum\turi',
      ...document.tracks.map((t) => [t.title, t.artist, t.album ?? '', t.uri ?? ''].join('\t')),
    ].join('\n') + '\n'
  );
}
