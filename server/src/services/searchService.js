import { DEFAULT_TLDS } from '../config/pricing.js';
import { AppError, ProviderTimeoutError, withTimeout } from '../utils/AppError.js';

export function createSearchService({ provider, timeoutMs, logger }) {
  return {
    async search({ label, tlds }) {
      const targets = (tlds ?? DEFAULT_TLDS).map((tld) => ({ tld, fqdn: `${label}.${tld}` }));
      const settled = await Promise.allSettled(
        targets.map(({ fqdn, tld }) => withTimeout(provider.check(fqdn, tld), timeoutMs)),
      );

      const failures = settled.filter((s) => s.status === 'rejected');
      if (failures.length === settled.length) {
        const timedOut = failures[0].reason instanceof ProviderTimeoutError;
        logger?.error({ err: failures[0].reason }, 'search provider failed');
        throw timedOut
          ? new AppError(504, 'PROVIDER_TIMEOUT', 'The search took too long. Please try again.')
          : new AppError(502, 'PROVIDER_ERROR', 'The search could not be completed. Please try again.');
      }

      const results = settled.map((s, i) =>
        s.status === 'fulfilled'
          ? s.value
          : {
              domain: targets[i].fqdn,
              isValid: true,
              availability: 'error',
              source: provider.name,
              message: 'This extension could not be checked. Try again.',
            },
      );
      return { query: label, source: provider.name, results };
    },
  };
}
