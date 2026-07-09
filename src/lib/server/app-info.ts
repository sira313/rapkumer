import packageJson from '../../../package.json' with { type: 'json' };

const fallbackVersion = '0.0.0';
const versionValue =
	typeof packageJson.version === 'string' && packageJson.version.trim()
		? packageJson.version.trim()
		: fallbackVersion;

export const APP_VERSION = versionValue;

export function getAppVersion(): string {
	return APP_VERSION;
}
