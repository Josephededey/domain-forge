import { asyncHandler } from '../utils/asyncHandler.js';
import { parseRecordId, validateRecordPatch } from '../validators/domainRecord.js';

// The owner is always req.user.id (from the session). Nothing in body/query/params can change it.
export function domainRecordController(service) {
  return {
    list: asyncHandler(async (req, res) => {
      res.json({ data: { records: await service.list(req.user.id) } });
    }),
    get: asyncHandler(async (req, res) => {
      res.json({ data: { record: await service.get(req.user.id, parseRecordId(req.params.id)) } });
    }),
    update: asyncHandler(async (req, res) => {
      const changes = validateRecordPatch(req.body);
      res.json({ data: { record: await service.update(req.user.id, parseRecordId(req.params.id), changes) } });
    }),
  };
}
