/**
 * Polar.sh client
 * Install: npm install @polar-sh/sdk
 *
 * Required env vars:
 *   POLAR_ACCESS_TOKEN  — org access token from polar.sh Settings → API Keys
 *   POLAR_PRODUCT_ID    — metered "BeeBot Resolutions" product ID
 */
let _polar = null;

export const getPolar = async () => {
    if (_polar) return _polar;
    if (!process.env.POLAR_ACCESS_TOKEN) {
        console.warn('[Polar] POLAR_ACCESS_TOKEN not set — billing disabled');
        return null;
    }
    const { Polar } = await import('@polar-sh/sdk');
    _polar = new Polar({
        accessToken: process.env.POLAR_ACCESS_TOKEN,
        server: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox',
    });
    return _polar;
};
