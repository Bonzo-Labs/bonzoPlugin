/**
 * Value representation with multiple formats from Bonzo API
 */
export interface BonzoValue {
    tiny_token: string;
    token_display: string;
    hbar_tinybar: string;
    hbar_display: string;
    usd_wad: string;
    usd_display: string;
    usd_abbreviated: string;
}

/**
 * Raw response from Bonzo Finance market API
 */
export interface BonzoMarketResponse {
    chain_id: number;
    network_name: string;
    total_market_supplied: BonzoValue;
    total_market_borrowed: BonzoValue;
    total_market_liquidity: BonzoValue;
    total_market_reserve: BonzoValue;
    reserves: BonzoReserveRaw[];
}

/**
 * Raw reserve data from Bonzo API
 */
export interface BonzoReserveRaw {
    id: number;
    name: string;
    symbol: string;
    coingecko_id: string;
    evm_address: string;
    hts_address: string;
    atoken_address: string;
    stable_debt_address: string;
    variable_debt_address: string;
    interest_rate_strategy_address: string;
    protocol_treasury_address: string;
    decimals: number;

    // Risk parameters (as numbers)
    ltv: number;
    liquidation_threshold: number;
    liquidation_bonus: number;
    reserve_factor: number;

    // Status flags
    active: boolean;
    frozen: boolean;
    variable_borrowing_enabled: boolean;
    stable_borrowing_enabled: boolean;

    // Market data with complex value objects
    available_liquidity: BonzoValue;
    total_borrowable_liquidity: BonzoValue;
    total_stable_debt: BonzoValue;
    total_variable_debt: BonzoValue;
    total_supply: BonzoValue;
    total_reserve: BonzoValue;
    borrow_cap: BonzoValue;
    supply_cap: BonzoValue;

    // Rates and metrics (as numbers)
    utilization_rate: number;
    supply_apy: number;
    variable_borrow_apy: number;
    stable_borrow_apy: number;

    // Price data
    price_weibars: string;
    price_usd_wad: string;
    price_usd_display: string;
}

/**
 * Simplified reserve data for internal use
 */
export interface BonzoReserve {
    id: number;
    symbol: string;
    name: string;
    decimals: number;
    htsAddress: string;
    evmAddress?: string;

    // APY rates (already numbers from API)
    supplyAPY: number;
    variableBorrowAPY: number;
    stableBorrowAPY: number;

    // Risk parameters
    ltv: number;
    liquidationThreshold: number;
    liquidationBonus: number;

    // Market metrics (simplified to USD values)
    availableLiquidityUSD: number;
    totalSupplyUSD: number;
    totalBorrowUSD: number;
    utilizationRate: number;

    // Status
    isActive: boolean;
    isFrozen: boolean;
    borrowingEnabled: boolean;
    stableBorrowingEnabled: boolean;

    // USD price
    priceUSD: number;
}

/**
 * Service error types
 */
export class BonzoServiceError extends Error {
    constructor(
        message: string,
        public readonly code: 'API_ERROR' | 'PARSE_ERROR' | 'NETWORK_ERROR',
        public readonly originalError?: unknown
    ) {
        super(message);
        this.name = 'BonzoServiceError';
    }
}

/**
 * Bonzo Finance market data service
 */
export class BonzoMarketService {
    private static readonly API_URL = 'https://mainnet-data.bonzo.finance/market';
    private static readonly TIMEOUT_MS = 5000;

    /**
     * Fetches raw market data from Bonzo Finance API
     */
    static async fetchMarketData(): Promise<BonzoMarketResponse> {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

            const response = await fetch(this.API_URL, {
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Bonzo-Strategy-Tool/1.0.0'
                }
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new BonzoServiceError(
                    `API request failed with status ${response.status}: ${response.statusText}`,
                    'API_ERROR'
                );
            }

            const data = await response.json();
            return data as BonzoMarketResponse;

        } catch (error) {
            if (error instanceof BonzoServiceError) {
                throw error;
            }

            if (error instanceof Error) {
                if (error.name === 'AbortError') {
                    throw new BonzoServiceError(
                        'Request timeout - Bonzo API took too long to respond',
                        'NETWORK_ERROR',
                        error
                    );
                }

                throw new BonzoServiceError(
                    `Network error: ${error.message}`,
                    'NETWORK_ERROR',
                    error
                );
            }

            throw new BonzoServiceError(
                'Unknown error occurred while fetching market data',
                'API_ERROR',
                error
            );
        }
    }

    /**
 * Parses USD display value from BonzoValue object
 */
    private static parseUSDValue(value: BonzoValue): number {
        try {
            const usdString = value.usd_display.replace(/,/g, '');
            const parsed = parseFloat(usdString);
            return isNaN(parsed) ? 0 : parsed;
        } catch {
            return 0;
        }
    }

    /**
     * Normalizes raw reserve data to internal format
     */
    private static normalizeReserves(rawReserves: BonzoReserveRaw[]): BonzoReserve[] {
        return rawReserves.map(raw => {
            try {
                return {
                    id: raw.id,
                    symbol: raw.symbol,
                    name: raw.name,
                    decimals: raw.decimals,
                    htsAddress: raw.hts_address,
                    evmAddress: (raw as any).evm_address,

                    // APY rates (already numbers)
                    supplyAPY: raw.supply_apy,
                    variableBorrowAPY: raw.variable_borrow_apy,
                    stableBorrowAPY: raw.stable_borrow_apy,

                    // Risk parameters
                    ltv: raw.ltv,
                    liquidationThreshold: raw.liquidation_threshold,
                    liquidationBonus: raw.liquidation_bonus,

                    // Market metrics (convert to USD numbers)
                    availableLiquidityUSD: this.parseUSDValue(raw.available_liquidity),
                    totalSupplyUSD: this.parseUSDValue(raw.total_supply),
                    totalBorrowUSD: this.parseUSDValue(raw.total_variable_debt) + this.parseUSDValue(raw.total_stable_debt),
                    utilizationRate: raw.utilization_rate,

                    // Status (normalize field names)
                    isActive: raw.active,
                    isFrozen: raw.frozen,
                    borrowingEnabled: raw.variable_borrowing_enabled,
                    stableBorrowingEnabled: raw.stable_borrowing_enabled,

                    // USD price
                    priceUSD: parseFloat(raw.price_usd_display) || 0
                };
            } catch (error) {
                throw new BonzoServiceError(
                    `Failed to normalize reserve ${raw.symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    'PARSE_ERROR',
                    error
                );
            }
        });
    }

    /**
 * Filters reserves to only include active, non-frozen reserves
 * For borrowing recommendations, also filters out reserves with borrowing disabled
 */
    private static filterActiveReserves(reserves: BonzoReserve[], includeBorrowingDisabled = false): BonzoReserve[] {
        return reserves.filter(reserve => {
            // Must be active and not frozen
            if (!reserve.isActive || reserve.isFrozen) {
                return false;
            }

            // If we're considering borrowing, must have borrowing enabled
            if (!includeBorrowingDisabled && !reserve.borrowingEnabled) {
                return false;
            }

            // Must have meaningful liquidity (> $100)
            if (reserve.availableLiquidityUSD < 100) {
                return false;
            }

            return true;
        });
    }

    /**
     * Sorts reserves by supply APY in descending order (highest yield first)
     */
    private static sortReservesBySupplyAPY(reserves: BonzoReserve[]): BonzoReserve[] {
        return [...reserves].sort((a, b) => b.supplyAPY - a.supplyAPY);
    }

    /**
     * Sorts reserves by variable borrow APY in ascending order (lowest cost first)
     */
    private static sortReservesByBorrowAPY(reserves: BonzoReserve[]): BonzoReserve[] {
        return [...reserves].sort((a, b) => a.variableBorrowAPY - b.variableBorrowAPY);
    }

    /**
     * Fetches and returns processed reserve data
     */
    static async fetchReserves(): Promise<BonzoReserve[]> {
        try {
            const marketData = await this.fetchMarketData();
            const normalizedReserves = this.normalizeReserves(marketData.reserves);
            return this.filterActiveReserves(normalizedReserves, true); // Include all for now
        } catch (error) {
            if (error instanceof BonzoServiceError) {
                throw error;
            }

            throw new BonzoServiceError(
                'Failed to fetch and process reserves',
                'PARSE_ERROR',
                error
            );
        }
    }

    /**
 * Fetches reserves suitable for supply recommendations (sorted by supply APY desc)
 */
    static async fetchSupplyReserves(): Promise<BonzoReserve[]> {
        try {
            const marketData = await this.fetchMarketData();
            const normalizedReserves = this.normalizeReserves(marketData.reserves);
            const filteredReserves = this.filterActiveReserves(normalizedReserves, true);
            return this.sortReservesBySupplyAPY(filteredReserves);
        } catch (error) {
            if (error instanceof BonzoServiceError) {
                throw error;
            }

            throw new BonzoServiceError(
                'Failed to fetch supply reserves',
                'PARSE_ERROR',
                error
            );
        }
    }

    /**
     * Fetches reserves suitable for borrow recommendations (sorted by borrow APY asc)
     */
    static async fetchBorrowReserves(): Promise<BonzoReserve[]> {
        try {
            const marketData = await this.fetchMarketData();
            const normalizedReserves = this.normalizeReserves(marketData.reserves);
            const filteredReserves = this.filterActiveReserves(normalizedReserves, false); // Exclude borrowing-disabled
            return this.sortReservesByBorrowAPY(filteredReserves);
        } catch (error) {
            if (error instanceof BonzoServiceError) {
                throw error;
            }

            throw new BonzoServiceError(
                'Failed to fetch borrow reserves',
                'PARSE_ERROR',
                error
            );
        }
    }
} 
