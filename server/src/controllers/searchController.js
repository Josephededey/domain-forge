import { validateSearchQuery } from '../validators/search.js';

export const searchController = (searchService) => async (req, res, next) => {
  try {
    const input = validateSearchQuery(req.query);
    const data = await searchService.search(input);
    res.status(200).json({ data });
  } catch (err) {
    next(err);
  }
};
