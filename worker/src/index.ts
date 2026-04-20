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

    // Scoring v2 (grid-based) not yet implemented; resolution step removed.
  },
};
