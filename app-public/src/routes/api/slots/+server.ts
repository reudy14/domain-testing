import { bookableTimesResponse } from '$shared/server/shop';
import type { RequestHandler } from './$types';

// Bookable times for the Shop block's picker (one service and duration).
// Public data from the shop hook in PocketBase — this only forwards it.
export const GET: RequestHandler = ({ locals, url }) => bookableTimesResponse(locals.pb, url);
