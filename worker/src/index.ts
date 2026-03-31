export default {
  async scheduled(event: ScheduledEvent, env: { API_BASE_URL: string; INTERNAL_API_SECRET: string }, ctx: ExecutionContext): Promise<void> {
    const headers = {
      'X-Internal-Secret': env.INTERNAL_API_SECRET,
      'Content-Type': 'application/json',
    };

    // Step 1: Fetch latest prices
    try {
      const priceRes = await fetch(`${env.API_BASE_URL}/api/internal/prices`, {
        method: 'POST',
        headers,
      });
      const priceData = await priceRes.json() as { message: string };
      console.log('Price fetch:', priceData.message);
    } catch (e) {
      console.error('Price fetch failed:', e);
    }

    // Step 2: Resolve matured forecasts and rebuild leaderboard
    try {
      const resolveRes = await fetch(`${env.API_BASE_URL}/api/internal/resolve`, {
        method: 'POST',
        headers,
      });
      const resolveData = await resolveRes.json() as { message: string };
      console.log('Resolution:', resolveData.message);
    } catch (e) {
      console.error('Resolution failed:', e);
    }
  },
};
