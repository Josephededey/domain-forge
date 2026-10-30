import { AppError } from '../utils/AppError.js';

const LOCKED = new Set(['cancelled', 'failed']);

export function createDomainRecordService({ records }) {
  const notFound = () => new AppError(404, 'NOT_FOUND', 'That domain record does not exist.');

  return {
    list: (userId) => records.listByUser(userId),

    async get(userId, id) {
      const record = await records.findForUser(id, userId);
      if (!record) throw notFound(); // other users' records look the same as missing ones
      return record;
    },

    async update(userId, id, changes) {
      const current = await this.get(userId, id);
      if (LOCKED.has(current.status)) {
        throw new AppError(409, 'RECORD_NOT_EDITABLE', 'This record can no longer be edited.');
      }
      const updated = await records.updateForUser(id, userId, changes);
      if (!updated) throw notFound();
      return updated;
    },
  };
}
