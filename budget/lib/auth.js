import { createAuthClient } from "better-auth/client";

const NEON_AUTH_BASE_URL = 'https://ep-morning-heart-aoh4onl2.neonauth.c-2.ap-southeast-1.aws.neon.tech/neondb/auth';

export const authClient = createAuthClient({
  baseURL: NEON_AUTH_BASE_URL,
});
