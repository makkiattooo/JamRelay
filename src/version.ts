import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const packageMetadata = require('../package.json') as { version: string; name: string };
export const APP_VERSION = packageMetadata.version;

export const APP_PACKAGE_NAME = packageMetadata.name;
