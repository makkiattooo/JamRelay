import { emitKeypressEvents } from 'node:readline';

type Key = { name?: string; ctrl?: boolean; meta?: boolean; sequence?: string };
type TuiContext = {
  step?: number | null;
  total?: number | null;
  language?: string;
  subtitle?: string;
};
type PromptOptions = {
  secret?: boolean;
  fieldLabel?: string;
  placeholder?: string;
  context?: string | ((value: string) => string);
  error?: string;
};

let context: TuiContext = {};
let lastPanel = '';
let sessionDepth = 0;
let activeRedraw: (() => void) | undefined;
let panelScroll = 0;
const JAMRELAY_LOGO = [
  '     ██╗ █████╗ ███╗   ███╗██████╗ ███████╗██╗      █████╗ ██╗   ██╗',
  '     ██║██╔══██╗████╗ ████║██╔══██╗██╔════╝██║     ██╔══██╗╚██╗ ██╔╝',
  '     ██║███████║██╔████╔██║██████╔╝█████╗  ██║     ███████║ ╚████╔╝',
  '██   ██║██╔══██║██║╚██╔╝██║██╔══██╗██╔══╝  ██║     ██╔══██║  ╚██╔╝',
  '╚█████╔╝██║  ██║██║ ╚═╝ ██║██║  ██║███████╗███████╗██║  ██║   ██║',
  ' ╚════╝ ╚═╝  ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝╚═╝  ╚═╝   ╚═╝',
  '',
];
const uiText: Record<string, Record<string, string>> = {
  choose: {
    en: 'Choose an option',
    pl: 'Wybierz opcję',
    de: 'Option auswählen',
    fr: 'Choisir une option',
    es: 'Elige una opción',
  },
  menuHint: {
    en: '↑↓ move · Enter select · PgUp/PgDn scroll · Esc back · Ctrl+C cancel',
    pl: '↑↓ nawiguj · Enter wybierz · PgUp/PgDn przewiń · Esc wstecz · Ctrl+C anuluj',
    de: '↑↓ bewegen · Enter wählen · PgUp/PgDn blättern · Esc zurück · Ctrl+C abbrechen',
    fr: '↑↓ déplacer · Entrée choisir · PgUp/PgDn défiler · Échap retour · Ctrl+C annuler',
    es: '↑↓ mover · Enter elegir · PgUp/PgDn desplazarse · Esc volver · Ctrl+C cancelar',
  },
  inputHint: {
    en: 'Enter continue · PgUp/PgDn scroll · Esc cancel · Ctrl+C cancel',
    pl: 'Enter dalej · PgUp/PgDn przewiń · Esc anuluj · Ctrl+C anuluj',
    de: 'Enter weiter · PgUp/PgDn blättern · Esc abbrechen · Ctrl+C abbrechen',
    fr: 'Entrée continuer · PgUp/PgDn défiler · Échap annuler · Ctrl+C annuler',
    es: 'Enter continuar · PgUp/PgDn desplazarse · Esc cancelar · Ctrl+C cancelar',
  },
  returnHint: {
    en: 'Press Enter to return · Ctrl+C cancel',
    pl: 'Naciśnij Enter, aby wrócić · Ctrl+C anuluj',
    de: 'Enter drücken, um zurückzukehren · Ctrl+C abbrechen',
    fr: 'Appuyez sur Entrée pour revenir · Ctrl+C annuler',
    es: 'Pulsa Enter para volver · Ctrl+C cancelar',
  },
  default: {
    en: 'Default',
    pl: 'Domyślnie',
    de: 'Standard',
    fr: 'Par défaut',
    es: 'Predeterminado',
  },
  placeholder: {
    en: 'Type your answer here',
    pl: 'Wpisz odpowiedź',
    de: 'Antwort eingeben',
    fr: 'Saisissez votre réponse',
    es: 'Escribe tu respuesta',
  },
};

function word(key: string) {
  return uiText[key]?.[context.language ?? 'en'] ?? uiText[key]?.en ?? key;
}

function isInteractive() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY && process.stdin.setRawMode);
}

function ansiEnabled() {
  if (!process.stdout.isTTY || process.env.NO_COLOR !== undefined || process.env.TERM === 'dumb')
    return false;
  if (process.platform !== 'win32') return true;
  return Boolean(
    process.env.WT_SESSION ||
    process.env.ANSICON ||
    process.env.ConEmuANSI === 'ON' ||
    process.env.TERM_PROGRAM,
  );
}

function color(code: string, value: string) {
  return ansiEnabled() ? `\u001b[${code}m${value}\u001b[0m` : value;
}

export function setTuiContext(next: TuiContext) {
  context = { ...context, ...next };
}

export function clearPanelContext() {
  lastPanel = '';
}

export function clearScreen() {
  if (ansiEnabled()) process.stdout.write('\u001b[2J\u001b[H');
}

/** Keep one alternate-screen application alive across every prompt in a command. */
export function beginTuiSession() {
  if (!isInteractive()) return () => {};
  sessionDepth += 1;
  if (sessionDepth === 1 && ansiEnabled()) process.stdout.write('\u001b[?1049h\u001b[?25h');
  const resize = () => activeRedraw?.();
  process.stdout.on('resize', resize);
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    process.stdout.off('resize', resize);
    sessionDepth = Math.max(0, sessionDepth - 1);
    if (sessionDepth === 0) {
      activeRedraw = undefined;
      if (ansiEnabled()) process.stdout.write('\u001b[?25h\u001b[?1049l');
    }
  };
}

export function terminalLink(url: string, label = url) {
  return ansiEnabled() ? `\u001b]8;;${url}\u001b\\${label}\u001b]8;;\u001b\\` : `${label} (${url})`;
}

function plainText(value: string) {
  return value.replace(/\u001b\]8;;.*?\u001b\\/g, '').replace(/\u001b\[[0-9;]*m/g, '');
}

function wrapText(value: string, width: number) {
  const result: string[] = [];
  for (const paragraph of plainText(value).split('\n')) {
    if (!paragraph) {
      result.push('');
      continue;
    }
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      if (line && line.length + word.length + 1 > width) {
        result.push(line);
        line = '';
      }
      if (word.length > width) {
        for (let index = 0; index < word.length; index += width)
          result.push(word.slice(index, index + width));
      } else line += `${line ? ' ' : ''}${word}`;
    }
    if (line) result.push(line);
  }
  return result;
}

function panelGeometry() {
  const columns = Math.max(12, process.stdout.columns || 80);
  const rows = Math.max(9, process.stdout.rows || 24);
  const width = Math.min(84, Math.max(10, columns - 2));
  const height = Math.max(JAMRELAY_LOGO.length + 7, Math.min(30, rows - 2));
  return {
    columns,
    rows,
    width,
    height,
    contentWidth: Math.max(6, width - 2),
    bodyHeight: Math.max(1, height - JAMRELAY_LOGO.length - 6),
    left: Math.max(0, Math.floor((columns - width) / 2)),
    top: Math.max(0, Math.floor((rows - height) / 2)),
  };
}

function panelText(title: string, body: string[], footer = '', scroll = 0) {
  const geometry = panelGeometry();
  const border = `+${'-'.repeat(geometry.width - 2)}+`;
  const line = (value: string) => {
    const visible = plainText(value);
    const rendered =
      visible.length <= geometry.contentWidth ? value : visible.slice(0, geometry.contentWidth);
    return `|${rendered}${' '.repeat(Math.max(0, geometry.contentWidth - visible.length))}|`;
  };
  const visible = body.slice(scroll, scroll + geometry.bodyHeight);
  if (scroll > 0 && visible.length) visible[0] = `… ${visible[0]}`;
  if (scroll + geometry.bodyHeight < body.length && visible.length)
    visible[visible.length - 1] = `${visible[visible.length - 1]} …`;
  const innerRows = [
    border,
    ...JAMRELAY_LOGO.map((logoLine) => line(color('1;36', logoLine))),
    line(progressMarker()),
    line(title),
    `+${'-'.repeat(geometry.width - 2)}+`,
    ...Array.from({ length: geometry.bodyHeight }, (_, index) => line(visible[index] ?? '')),
    line(footer),
    border,
  ];
  const leftPad = ' '.repeat(geometry.left);
  const rows = [
    ...Array.from({ length: geometry.top }, () => ''),
    ...innerRows.map((row) => `${leftPad}${row}`),
    ...Array.from(
      { length: Math.max(0, geometry.rows - geometry.top - innerRows.length) },
      () => '',
    ),
  ];
  return {
    text: rows.join('\n'),
    geometry,
    bodyStart: geometry.top + JAMRELAY_LOGO.length + 5,
  };
}

function progressMarker() {
  if (!context.step || !context.total) return `[JR] ${context.language?.toUpperCase() ?? ''}`;
  const filled = Math.max(0, Math.min(10, Math.round((context.step / context.total) * 10)));
  return `[JR] [${'#'.repeat(filled)}${'-'.repeat(10 - filled)}] ${context.step}/${context.total}`;
}

function frame(title: string, body: string, subtitle?: string, scroll = 0, redraw = false) {
  // Redraws move the cursor home instead of clearing, so typing does not flicker the whole panel.
  if (redraw && ansiEnabled()) process.stdout.write('[H');
  else clearScreen();
  const geometry = panelGeometry();
  const bodyLines = wrapText(body, geometry.contentWidth);
  const rendered = panelText(title, bodyLines, subtitle ?? '', scroll);
  process.stdout.write(`${rendered.text}\n`);
  return rendered;
}

export function showPanel(title: string, body: string, subtitle?: string) {
  lastPanel = body;
  panelScroll = 0;
  activeRedraw = () => frame(title, body, subtitle);
  activeRedraw();
}

export function showLoadingPanel(title: string, message: string) {
  const frames = ['◐', '◓', '◑', '◒'];
  let frameIndex = 0;
  const draw = () => showPanel(title, `${frames[frameIndex++ % frames.length]}  ${message}`);
  draw();
  const timer = setInterval(draw, 180);
  timer.unref();
  return () => clearInterval(timer);
}

export function showResult(title: string, body: string, success = true) {
  const rendered = `${color(success ? '32;1' : '31;1', success ? '●' : '×')} ${body}`;
  activeRedraw = () => frame(title, rendered);
  activeRedraw();
}

/** Redraw one stable screen instead of appending new copies while navigating. */
export async function selectOption<T>(
  options: readonly { label: string; value: T }[],
  initial = 0,
  screen?: string | ((cursor: number) => string),
  details?: string,
) {
  if (!isInteractive()) return undefined;
  if (!options.length) return undefined;
  emitKeypressEvents(process.stdin);
  const input = process.stdin;
  const output = process.stdout;
  const ansi = ansiEnabled();
  const wasRaw = input.isRaw;
  let cursor = Math.max(0, Math.min(initial, options.length - 1));
  input.setRawMode(true);
  input.resume();
  if (ansi && sessionDepth === 0) output.write('\u001b[?1049h\u001b[?25l');
  else if (ansi) output.write('\u001b[?25l');
  let drawn = false;
  const draw = () => {
    if (!ansi && drawn) {
      output.write(`\nSelected: ${options[cursor].label}`);
      return;
    }
    drawn = true;
    clearScreen();
    if (screen) output.write(`${typeof screen === 'function' ? screen(cursor) : screen}\n`);
    else {
      const body = [
        ...(details ? [details, ''] : []),
        ...options.map(
          (option, index) => `${index === cursor ? '>' : ' '} ${index + 1}. ${option.label}`,
        ),
      ].join('\n');
      frame(word('choose'), body, word('menuHint'), panelScroll);
    }
  };
  activeRedraw = draw;
  draw();
  return new Promise<T | undefined>((resolve, reject) => {
    let finished = false;
    const finish = (value?: T, error?: Error) => {
      if (finished) return;
      finished = true;
      input.off('keypress', onKey);
      input.off('end', onEnd);
      output.off('resize', draw);
      try {
        input.setRawMode(wasRaw ?? false);
      } finally {
        input.pause();
        if (ansi && sessionDepth === 0) output.write('\u001b[?25h\u001b[?1049l');
        else if (ansi) output.write('\u001b[?25h');
      }
      if (error) reject(error);
      else resolve(value);
    };
    const onEnd = () => finish(undefined, new Error('Setup cancelled.'));
    const onKey = (text: string | undefined, key: Key) => {
      if (key.ctrl && (key.name === 'c' || key.name === 'd'))
        return finish(undefined, new Error('Setup cancelled.'));
      if (key.name === 'pageup' || key.name === 'pagedown') {
        panelScroll = Math.max(
          0,
          panelScroll + (key.name === 'pageup' ? -1 : 1) * panelGeometry().bodyHeight,
        );
        draw();
        return;
      }
      if (key.name === 'up') cursor = (cursor + options.length - 1) % options.length;
      else if (key.name === 'down') cursor = (cursor + 1) % options.length;
      else if (key.name === 'escape') return finish(undefined);
      else if (text && /^[1-9]$/.test(text)) {
        const index = Number(text) - 1;
        if (index < options.length) return finish(options[index].value);
      } else if (key.name === 'return' || key.name === 'enter')
        return finish(options[cursor].value);
      draw();
    };
    input.on('keypress', onKey);
    input.once('end', onEnd);
    output.on('resize', draw);
  });
}

export async function promptText(label: string, fallback = '', options: PromptOptions = {}) {
  if (!isInteractive()) throw new Error('Interactive setup requires a terminal.');
  emitKeypressEvents(process.stdin);
  const input = process.stdin;
  const output = process.stdout;
  const ansi = ansiEnabled();
  const wasRaw = input.isRaw;
  let value = fallback;
  let cursor = value.length;
  let contextScroll = 0;
  input.setRawMode(true);
  input.resume();
  if (ansi && sessionDepth === 0) output.write('\u001b[?1049h\u001b[?25l');
  let drawn = false;
  const contextViewport = () => {
    const promptContext =
      (typeof options.context === 'function' ? options.context(value) : options.context) ??
      lastPanel;
    if (!promptContext) return [] as string[];
    const width = panelGeometry().contentWidth;
    const wrapped = promptContext.split('\n').flatMap((part) => {
      if (!part) return [''];
      const result: string[] = [];
      let current = '';
      for (const word of part.split(/\s+/)) {
        if (current && current.length + word.length + 1 <= width) current += ` ${word}`;
        else if (word.length <= width) {
          if (current) result.push(current);
          current = word;
        } else {
          if (current) result.push(current);
          for (let index = 0; index < word.length; index += width)
            result.push(word.slice(index, index + width));
          current = '';
        }
      }
      if (current) result.push(current);
      return result;
    });
    const available = Math.max(1, panelGeometry().bodyHeight - 3);
    contextScroll = Math.max(0, Math.min(contextScroll, Math.max(0, wrapped.length - available)));
    const visible = wrapped.slice(contextScroll, contextScroll + available);
    if (contextScroll > 0) visible.unshift('…');
    if (contextScroll + available < wrapped.length) visible.push('…');
    return visible;
  };
  const displayValue = () => (options.secret ? '•'.repeat(value.length) : value);
  const draw = () => {
    if (!ansi && drawn) return;
    const redraw = drawn;
    drawn = true;
    const visibleContext = contextViewport();
    const geometry = panelGeometry();
    const prefix = [visibleContext.join('\n'), options.error ?? ''].filter(Boolean).join('\n\n');
    const prefixLines = prefix ? wrapText(prefix, geometry.contentWidth).length : 0;
    const fieldWidth = Math.max(1, geometry.contentWidth - 6);
    const inputStart = Math.max(0, Math.min(cursor - fieldWidth + 1, value.length - fieldWidth));
    const shownValue = displayValue() || options.placeholder || label || word('placeholder');
    const fieldValue = shownValue.slice(inputStart, inputStart + fieldWidth).padEnd(fieldWidth);
    const inputRows = [
      `+${'-'.repeat(geometry.contentWidth - 2)}+`,
      ...(options.fieldLabel
        ? [
            `| ${options.fieldLabel.padEnd(Math.max(1, geometry.contentWidth - 4)).slice(0, geometry.contentWidth - 4)} |`,
          ]
        : []),
      `| > ${fieldValue} |`,
      `+${'-'.repeat(geometry.contentWidth - 2)}+`,
    ];
    const body = [
      ...(prefix ? [...wrapText(prefix, geometry.contentWidth), ''] : []),
      ...inputRows,
    ];
    const inputLine = prefixLines + (prefix ? 1 : 0) + (options.fieldLabel ? 2 : 1);
    const scroll = Math.max(0, inputLine - geometry.bodyHeight + 1);
    const rendered = frame(
      label,
      body.join('\n'),
      fallback && !options.secret
        ? `${word('default')}: ${fallback} | ${word('inputHint')}`
        : word('inputHint'),
      scroll,
      redraw,
    );
    if (ansi && output.isTTY) {
      const row = Math.min(geometry.rows, rendered.bodyStart + inputLine - scroll);
      output.write(
        `\u001b[6 q\u001b[${row};${geometry.left + 6 + cursor - inputStart}H\u001b[?25h`,
      );
    } else output.write('\n> ');
  };
  activeRedraw = draw;
  draw();
  return new Promise<string>((resolve, reject) => {
    let finished = false;
    const finish = (result?: string, error?: Error) => {
      if (finished) return;
      finished = true;
      input.off('keypress', onKey);
      input.off('end', onEnd);
      output.off('resize', draw);
      try {
        input.setRawMode(wasRaw ?? false);
      } finally {
        input.pause();
        if (ansi) output.write('\u001b[?25h\u001b[0 q');
        if (ansi && sessionDepth === 0) output.write('\u001b[?1049l');
        else output.write('\n');
      }
      if (error) reject(error);
      else resolve(result ?? fallback);
    };
    const onEnd = () => finish(undefined, new Error('Setup cancelled.'));
    const onKey = (text: string | undefined, key: Key) => {
      let changed = false;
      if (key.ctrl && (key.name === 'c' || key.name === 'd'))
        return finish(undefined, new Error('Setup cancelled.'));
      if (key.name === 'escape') return finish(undefined, new Error('Setup cancelled.'));
      if (key.name === 'return' || key.name === 'enter') return finish(value.trim() || fallback);
      if (key.name === 'pageup') {
        contextScroll = Math.max(0, contextScroll - Math.max(1, (output.rows || 24) - 14));
        draw();
        return;
      }
      if (key.name === 'pagedown') {
        contextScroll += Math.max(1, (output.rows || 24) - 14);
        draw();
        return;
      }
      if (key.name === 'backspace' && cursor > 0) {
        value = value.slice(0, cursor - 1) + value.slice(cursor);
        cursor -= 1;
        changed = true;
        if (!ansi) output.write('\b \b');
      } else if (key.name === 'delete' && cursor < value.length) {
        value = value.slice(0, cursor) + value.slice(cursor + 1);
        changed = true;
      } else if (key.name === 'left' && ansi) {
        cursor = Math.max(0, cursor - 1);
        changed = true;
      } else if (key.name === 'right' && ansi) {
        cursor = Math.min(value.length, cursor + 1);
        changed = true;
      } else if (key.name === 'home' && ansi) {
        cursor = 0;
        changed = true;
      } else if (key.name === 'end' && ansi) {
        cursor = value.length;
        changed = true;
      } else if (text && !key.ctrl && !key.meta && !key.sequence?.startsWith('\u001b')) {
        if (ansi) value = value.slice(0, cursor) + text + value.slice(cursor);
        else value += text;
        cursor += text.length;
        changed = true;
        if (!ansi) output.write(options.secret ? '•'.repeat(text.length) : text);
      }
      if (changed && ansi) draw();
    };
    input.on('keypress', onKey);
    input.once('end', onEnd);
    output.on('resize', draw);
  });
}

/** Show the current panel and wait for Enter without rendering a text input. */
export async function waitForEnter(label: string) {
  if (!isInteractive()) throw new Error('Interactive setup requires a terminal.');
  emitKeypressEvents(process.stdin);
  const input = process.stdin;
  const output = process.stdout;
  const ansi = ansiEnabled();
  const wasRaw = input.isRaw;
  input.setRawMode(true);
  input.resume();
  if (ansi && sessionDepth === 0) output.write('\u001b[?1049h\u001b[?25l');
  else if (ansi) output.write('\u001b[?25l');
  const draw = () => frame(label, lastPanel, word('returnHint'), panelScroll);
  activeRedraw = draw;
  draw();
  return new Promise<void>((resolve, reject) => {
    let finished = false;
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      input.off('keypress', onKey);
      input.off('end', onEnd);
      output.off('resize', draw);
      try {
        input.setRawMode(wasRaw ?? false);
      } finally {
        input.pause();
        if (ansi && sessionDepth === 0) output.write('\u001b[?25h\u001b[?1049l');
        else if (ansi) output.write('\u001b[?25h');
      }
      if (error) reject(error);
      else resolve();
    };
    const onEnd = () => finish(new Error('Setup cancelled.'));
    const onKey = (_text: string | undefined, key: Key) => {
      if (key.ctrl && (key.name === 'c' || key.name === 'd'))
        return finish(new Error('Setup cancelled.'));
      if (key.name === 'return' || key.name === 'enter') return finish();
      if (key.name === 'escape') return finish(new Error('Setup cancelled.'));
      if (key.name === 'pageup' || key.name === 'pagedown') {
        panelScroll = Math.max(
          0,
          panelScroll + (key.name === 'pageup' ? -1 : 1) * panelGeometry().bodyHeight,
        );
        draw();
      }
    };
    input.on('keypress', onKey);
    input.once('end', onEnd);
    output.on('resize', draw);
  });
}

export async function promptConfirm(
  label: string,
  yesLabel: string,
  noLabel: string,
  initial = true,
) {
  const choice = await selectOption(
    [
      { value: true, label: yesLabel },
      { value: false, label: noLabel },
    ],
    initial ? 0 : 1,
    (cursor) => menuPanel(label, [yesLabel, noLabel], cursor),
  );
  if (choice === undefined) throw new Error('Setup cancelled.');
  return choice;
}

/** A compact branded screen for instructions and verification results. */
export function menuPanel(
  title: string,
  labels: readonly string[],
  selected: number,
  details = lastPanel,
) {
  const geometry = panelGeometry();
  const contentWidth = geometry.contentWidth;
  const bodyHeight = geometry.bodyHeight;
  const optionViewport = Math.max(1, Math.floor(bodyHeight / 2));
  const detailViewport = Math.max(0, bodyHeight - optionViewport - 1);
  const detailLines = wrapText(details, contentWidth);
  panelScroll = Math.max(
    0,
    Math.min(panelScroll, Math.max(0, detailLines.length - detailViewport)),
  );
  const visibleDetails = detailLines.slice(panelScroll, panelScroll + detailViewport);
  if (panelScroll > 0 && visibleDetails.length) visibleDetails[0] = `… ${visibleDetails[0]}`;
  if (panelScroll + detailViewport < detailLines.length && visibleDetails.length)
    visibleDetails[visibleDetails.length - 1] += ' …';

  const optionLines = labels.flatMap((label, index) => {
    const prefix = `${index === selected ? '>' : ' '} ${index + 1}. `;
    const available = Math.max(1, contentWidth - prefix.length);
    const wrapped = wrapText(label, available);
    return wrapped.map(
      (part, lineIndex) => `${lineIndex === 0 ? prefix : ' '.repeat(prefix.length)}${part}`,
    );
  });
  const optionStarts: number[] = [];
  let optionLineIndex = 0;
  labels.forEach((label) => {
    optionStarts.push(optionLineIndex);
    optionLineIndex += wrapText(label, Math.max(1, contentWidth - 6)).length;
  });
  let optionScroll = Math.max(0, optionStarts[selected] - Math.floor(optionViewport / 2));
  optionScroll = Math.min(optionScroll, Math.max(0, optionLines.length - optionViewport));
  const visibleOptions = optionLines.slice(optionScroll, optionScroll + optionViewport);
  if (optionScroll > 0 && visibleOptions.length) visibleOptions[0] = `… ${visibleOptions[0]}`;
  if (optionScroll + optionViewport < optionLines.length && visibleOptions.length)
    visibleOptions[visibleOptions.length - 1] += ' …';

  const body = [...visibleDetails, '', ...visibleOptions].slice(0, bodyHeight);
  return panelText(title, body, word('menuHint')).text;
}

export function welcome(languageNames: readonly string[], selected: number) {
  const body = [
    'Choose the language for this setup session.',
    '',
    ...languageNames.map(
      (name, index) => `${index === selected ? '>' : ' '} ${index + 1}. ${name}`,
    ),
    '',
    'Use up/down, press 1–5 for instant selection, or press Enter.',
  ].join('\n');
  return panelText('Welcome to JamRelay', wrapText(body, panelGeometry().contentWidth), '').text;
}
