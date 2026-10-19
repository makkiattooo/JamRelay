import { installationPaths, readSettings } from '../../runtime/installation.js';
import { messages } from './messages.js';

export const languages = ['pl', 'en', 'de', 'fr', 'es'] as const;
export type Language = (typeof languages)[number];
export const languageNames: Record<Language, string> = {
  pl: 'Polski',
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
};
export function localeLanguage(locale: string | undefined): Language {
  const code = locale
    ?.trim()
    .toLowerCase()
    .split(/[-_.@]/)[0];
  return languages.includes(code as Language) ? (code as Language) : 'en';
}
export function currentLanguage(): Language {
  let saved: string | undefined;
  try {
    saved = readSettings(installationPaths().config).JAMRELAY_LANGUAGE;
  } catch {
    /* CLI remains usable with unreadable config. */
  }
  return localeLanguage(
    process.env.JAMRELAY_LANGUAGE ||
      saved ||
      process.env.LC_ALL ||
      process.env.LC_MESSAGES ||
      process.env.LANG ||
      Intl.DateTimeFormat().resolvedOptions().locale,
  );
}
export type Message = keyof typeof messages;
export function translate(
  message: Message,
  language = currentLanguage(),
  ...values: unknown[]
): string {
  const row = messages[message];
  const template = language === 'en' ? message : row[language];
  return template.replace(/\{(\d+)\}/g, (_, index: string) => String(values[Number(index)] ?? ''));
}
export function translator(language: Language) {
  return (message: Message, ...values: unknown[]) => translate(message, language, ...values);
}
// Only known application prose is translated; dynamic/provider data is untouched.
export function knownMessage(message: string, language = currentLanguage()): string {
  if (message.startsWith('Usage: ')) return translate('Usage', language) + message.slice(5);
  if (Object.hasOwn(messages, message)) return translate(message as Message, language);
  for (const key of [
    'Applied migration mismatch: {0}',
    '{0} optional provider is not configured.',
    '{0} must be an absolute path.',
    'No official published {0} found.',
  ] as const) {
    const [before, after] = key.split('{0}');
    if (message.startsWith(before) && message.endsWith(after))
      return translate(
        key,
        language,
        message.slice(before.length, after ? -after.length : undefined),
      );
  }
  return message;
}
const errorLanguages = new WeakMap<object, Language>();
export function rememberErrorLanguage(error: unknown, language: Language) {
  if (error && typeof error === 'object') errorLanguages.set(error, language);
}
export function errorLanguage(error: unknown) {
  return error && typeof error === 'object'
    ? (errorLanguages.get(error) ?? currentLanguage())
    : currentLanguage();
}
const affirmative: Record<Language, readonly string[]> = {
  en: ['y', 'yes'],
  pl: ['t', 'tak'],
  de: ['j', 'ja'],
  fr: ['o', 'oui'],
  es: ['s', 'sí', 'si'],
};
const negative: Record<Language, readonly string[]> = {
  en: ['n', 'no'],
  pl: ['n', 'nie'],
  de: ['n', 'nein'],
  fr: ['n', 'non'],
  es: ['n', 'no'],
};
export function yesNo(value: string, language: Language): boolean | undefined {
  const answer = value.trim().toLowerCase();
  if ([...affirmative.en, ...affirmative[language]].includes(answer)) return true;
  if ([...negative.en, ...negative[language]].includes(answer)) return false;
  return undefined;
}
export const languageMenu = languages
  .map((language, index) => `${index + 1}. ${languageNames[language]}`)
  .join('\n');
export const languagePrompt = 'Język / Language / Sprache / Langue / Idioma (1–5)';
export function selectLanguage(value: string, fallback: Language): Language | undefined {
  if (!value.trim()) return fallback;
  return languages[languages.findIndex((_, index) => String(index + 1) === value.trim())];
}
