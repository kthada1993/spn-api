import { ok } from '../utils/api-response.js';

export function healthCheck(req, res) {
  return ok(res, null, 'API is running');
}
