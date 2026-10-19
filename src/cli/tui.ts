import { emitKeypressEvents } from 'node:readline';

type Key = { name?: string; ctrl?: boolean; sequence?: string };

function isInteractive() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY && process.stdin.setRawMode);
}

export function clearScreen() {
  if (process.stdout.isTTY) process.stdout.write('\u001b[2J\u001b[H');
}

export function terminalLink(url: string, label = url) {
  return process.stdout.isTTY
    ? `\u001b]8;;${url}\u001b\\${label}\u001b]8;;\u001b\\`
    : `${label} (${url})`;
}

/** A small raw-key menu. Number keys choose immediately; terminal state is always restored. */
export async function selectOption<T>(
  options: readonly { label: string; value: T }[],
  initial = 0,
  screen?: string | ((cursor: number) => string),
) {
  if (!isInteractive()) return undefined;
  emitKeypressEvents(process.stdin);
  const input = process.stdin;
  const output = process.stdout;
  const wasRaw = input.isRaw;
  let cursor = Math.max(0, Math.min(initial, options.length - 1));
  input.setRawMode(true);
  input.resume();
  const draw = () => {
    output.write('\u001b[2J\u001b[H');
    if (screen) output.write(`${typeof screen === 'function' ? screen(cursor) : screen}\n`);
    else
      options.forEach((option, index) =>
        output.write(`${index === cursor ? '›' : ' '} ${index + 1}. ${option.label}\n`),
      );
    if (!screen)
      output.write('\n↑↓ navigate · 1–9 select · Enter confirm · Esc back · Ctrl+C cancel\n');
  };
  draw();
  return new Promise<T | undefined>((resolve, reject) => {
    const finish = (value?: T, error?: Error) => {
      input.off('keypress', onKey);
      input.off('end', onEnd);
      output.off('resize', draw);
      input.setRawMode(wasRaw ?? false);
      input.pause();
      output.write('\u001b[?25h\n');
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

export function welcome(languageNames: readonly string[], selected: number) {
  const lines = [
    '╭────────────────────────────────────────────╮',
    '│                                            │',
    '│                 JAMRELAY                   │',
    '│                                            │',
    '│ Welcome to JamRelay                        │',
    '│ Choose your language                      │',
    ...languageNames.map(
      (name, index) => `│  ${index === selected ? '›' : ' '} ${index + 1}  ${name.padEnd(35)}│`,
    ),
    '│                                            │',
    '│  ↑↓ Navigate   1–5 Select   Enter Confirm  │',
    '╰────────────────────────────────────────────╯',
  ];
  return lines.join('\n');
}

export function menuPanel(title: string, labels: readonly string[], selected: number) {
  const inner = Math.min(
    72,
    Math.max(36, title.length + 4, ...labels.map((label) => label.length + 7)),
  );
  const line = (content: string) => `│ ${content.padEnd(inner - 2).slice(0, inner - 2)} │`;
  return [
    `╭${'─'.repeat(inner)}╮`,
    line(title),
    line(''),
    ...labels.map((label, index) =>
      line(`${index === selected ? '›' : ' '} ${index + 1}. ${label}`),
    ),
    line(''),
    line('↑↓ navigate · number select · Enter confirm · Esc back'),
    `╰${'─'.repeat(inner)}╯`,
  ].join('\n');
}
