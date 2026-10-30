import { priceFor } from '../config/pricing.js';

/**
 * Deterministic demo provider. It NEVER asserts live availability:
 * availability is always "unknown" and source is always "simulation".
 * A future RegistrarDomainProvider must implement the same check(fqdn, tld) contract.
 */
export class MockDomainProvider {
  name = 'simulation';

  async check(fqdn, tld) {
    return {
      domain: fqdn,
      isValid: true,
      availability: 'unknown',
      source: 'simulation',
      checkedAt: new Date().toISOString(),
      price: priceFor(tld),
      message: 'Demonstration result; availability is not verified.',
    };
  }
}
