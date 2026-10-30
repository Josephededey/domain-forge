import { hash, verify, Algorithm } from '@node-rs/argon2';

// OWASP-recommended minimum Argon2id parameters (19 MiB, t=2, p=1).
const options = { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const passwordHasher = {
  hash: (password) => hash(password, options),
  async verify(hashed, password) {
    try {
      return await verify(hashed, password);
    } catch {
      return false; // malformed hash (e.g. disabled seed account) never authenticates
    }
  },
};
