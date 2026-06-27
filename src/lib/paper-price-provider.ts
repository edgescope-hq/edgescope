// Pluggable price provider abstraction for paper trading.
// Default implementation is a mock random-walk provider. Swap with a real
// quote API later by implementing the `PriceProvider` interface and
// re-exporting it as `priceProvider`.

export interface PriceProvider {
  // Get current price for an instrument. The `seed` is used by the mock
  // provider as a starting point (typically the entry price). A real
  // provider can ignore it.
  getPrice(instrument: string, seed: number): Promise<number>;
}

type State = { last: number };

class MockRandomWalkProvider implements PriceProvider {
  private state = new Map<string, State>();

  async getPrice(instrument: string, seed: number): Promise<number> {
    const key = instrument.toUpperCase();
    const prev = this.state.get(key);
    const base = prev?.last ?? seed;
    // Random walk: ±0.05% step per tick, plus tiny mean reversion to seed.
    const drift = (seed - base) * 0.005;
    const noise = base * (Math.random() - 0.5) * 0.001;
    const next = Math.max(0.0001, base + drift + noise);
    this.state.set(key, { last: next });
    return next;
  }
}

export const priceProvider: PriceProvider = new MockRandomWalkProvider();
