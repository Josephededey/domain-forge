import base from './playwright.config.js';

// Captures README screenshots of the seeded, fictional demo data: `npm run screenshots`
export default { ...base, testIgnore: [], testMatch: ['**/screenshots.spec.js'], reporter: 'list' };
