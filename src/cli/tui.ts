import { emitKeypressEvents } from 'node:readline';

type Key = { name?: string; ctrl?: boolean; meta?: boolean; sequence?: string };
type TuiContext = { step?: number; total?: number; language?: string; subtitle?: string };
type PromptOptions = { secret?: boolean; context?: string; error?: string };

let context: TuiContext = {};
let lastPanel = '';
const uiText: Record<string, Record<string, string>> = {
  step: { en: 'STEP', pl: 'KROK', de: 'SCHRITT', fr: 'ÉTAPE', es: 'PASO' },
  choose: {
    en: 'Choose an option',
    pl: 'Wybierz opcję',
    de: 'Option auswählen',
    fr: 'Choisir une option',
    es: 'Elige una opción',
  },
  menuHint: {
    en: '↑↓ move  ·  Enter select  ·  Esc back  ·  Ctrl+C cancel',
    pl: '↑↓ nawiguj  ·  Enter wybierz  ·  Esc wstecz  ·  Ctrl+C anuluj',
    de: '↑↓ bewegen  ·  Enter wählen  ·  Esc zurück  ·  Ctrl+C abbrechen',
    fr: '↑↓ déplacer  ·  Entrée choisir  ·  Échap retour  ·  Ctrl+C annuler',
    es: '↑↓ mover  ·  Enter elegir  ·  Esc volver  ·  Ctrl+C cancelar',
  },
  inputHint: {
    en: 'Enter continue  ·  Esc cancel  ·  Ctrl+C cancel',
    pl: 'Enter dalej  ·  Esc anuluj  ·  Ctrl+C anuluj',
    de: 'Enter weiter  ·  Esc abbrechen  ·  Ctrl+C abbrechen',
    fr: 'Entrée continuer  ·  Échap annuler  ·  Ctrl+C annuler',
    es: 'Enter continuar  ·  Esc cancelar  ·  Ctrl+C cancelar',
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

export function clearScreen() {
  if (ansiEnabled()) process.stdout.write('\u001b[2J\u001b[H');
}

export function terminalLink(url: string, label = url) {
  return ansiEnabled() ? `\u001b]8;;${url}\u001b\\${label}\u001b]8;;\u001b\\` : `${label} (${url})`;
}

function header(title: string, subtitle?: string) {
  const progress =
    context.step && context.total
      ? color('36', `${word('step')} ${context.step}/${context.total}`)
      : context.language
        ? color('36', context.language.toUpperCase())
        : '';
  return [
    color('1;36', 'JAMRELAY'),
    progress,
    color('1', title),
    subtitle ?? context.subtitle ?? '',
    '─'.repeat(Math.max(24, Math.min(64, (process.stdout.columns || 80) - 8))),
  ]
    .filter(Boolean)
    .join('\n');
}

function frame(title: string, body: string, subtitle?: string) {
  clearScreen();
  process.stdout.write(`${header(title, subtitle)}\n\n${body}\n`);
}

export function showPanel(title: string, body: string, subtitle?: string) {
  lastPanel = body;
  frame(title, body, subtitle);
}

export function showResult(title: string, body: string, success = true) {
  frame(title, `${color(success ? '32;1' : '31;1', success ? '●' : '×')} ${body}`);
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
  if (ansi) output.write('\u001b[?1049h\u001b[?25l');
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
      output.write(`${header(word('choose'))}\n\n`);
      if (details) output.write(`${details}\n\n`);
      options.forEach((option, index) =>
        output.write(
          `${index === cursor ? color('36;1', '❯') : ' '} ${
            index === cursor ? color('1', option.label) : option.label
          }\n`,
        ),
      );
      output.write(`\n${color('2', word('menuHint'))}`);
    }
  };
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
        if (ansi) output.write('\u001b[?25h\u001b[?1049l');
      }
      if (error) reject(error);
      else resolve(value);
    };
    const onEnd = () => finish(undefined, new Error('Setup cancelled.'));
    const onKey = (text: string | undefined, key: Key) => {
      if (key.ctrl && (key.name === 'c' || key.name === 'd'))
        return finish(undefined, new Error('Setup cancelled.'));
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
  input.setRawMode(true);
  input.resume();
  if (ansi) output.write('\u001b[?1049h\u001b[?25l');
  let drawn = false;
  const inputRow = () => {
    const promptContext = options.context ?? lastPanel;
    const contextLines = promptContext ? promptContext.split('\n').length + 1 : 0;
    const errorLines = options.error ? 2 : 0;
    return Math.min((output.rows || 24) - 1, 7 + contextLines + errorLines);
  };
  const displayValue = () =>
    options.secret ? '•'.repeat(value.length) : value || color('2', word('placeholder'));
  const refreshInput = () => {
    if (ansi && output.isTTY) {
      const width = Math.max(1, output.columns || 80);
      const row = inputRow();
      // Input is the last content row: replace just that row instead of clearing
      // and repainting the whole terminal for every typed or pasted character.
      output.write(`\u001b[${row};1H\u001b[J${displayValue()}`);
      const cursorRow = Math.min((output.rows || 24) - 1, row + Math.floor(cursor / width));
      const column = (cursor % width) + 1;
      output.write(`\u001b[${cursorRow};${column}H\u001b[?25h`);
    }
  };
  const draw = () => {
    if (!ansi && drawn) return;
    drawn = true;
    frame(
      label,
      `${(options.context ?? lastPanel) ? `${options.context ?? lastPanel}\n\n` : ''}${options.error ? `${color('31;1', options.error)}\n\n` : ''}${displayValue()}`,
      fallback && !options.secret ? `${word('default')}: ${fallback}` : word('inputHint'),
    );
    if (ansi && output.isTTY) {
      const width = Math.max(1, output.columns || 80);
      const row = Math.min((output.rows || 24) - 1, inputRow() + Math.floor(cursor / width));
      output.write(`\u001b[${row};${(cursor % width) + 1}H\u001b[?25h`);
    } else output.write('\n> ');
  };
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
        if (ansi) output.write('\u001b[?25h\u001b[?1049l');
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
      if (changed && ansi) refreshInput();
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
export function menuPanel(title: string, labels: readonly string[], selected: number) {
  const inner = Math.min(
    72,
    Math.max(36, title.length + 4, ...labels.map((label) => label.length + 7)),
  );
  const line = (content: string) => `│ ${content.padEnd(inner - 2).slice(0, inner - 2)} │`;
  return [
    color('1;36', 'JAMRELAY'),
    context.step && context.total
      ? color('36', `${word('step')} ${context.step}/${context.total}`)
      : '',
    `╭${'─'.repeat(inner)}╮`,
    line(title),
    ...(lastPanel
      ? [
          line(''),
          ...lastPanel
            .split('\n')
            .slice(0, 4)
            .map((part) => line(part)),
          ...(lastPanel.split('\n').length > 4 ? [line('…')] : []),
        ]
      : []),
    line(''),
    ...labels.map((label, index) =>
      line(`${index === selected ? color('36;1', '❯') : ' '} ${index + 1}. ${label}`),
    ),
    line(''),
    line(word('menuHint')),
    `╰${'─'.repeat(inner)}╯`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function welcome(languageNames: readonly string[], selected: number) {
  return [
    color('1;36', 'JAMRELAY'),
    '',
    color('1', 'Welcome to JamRelay'),
    'Choose the language for this setup session.',
    '',
    ...languageNames.map(
      (name, index) => `${index === selected ? color('36;1', '❯') : ' '} ${index + 1}. ${name}`,
    ),
    '',
    color('2', 'Use ↑/↓, press 1–5 for instant selection, or press Enter.'),
  ].join('\n');
}
